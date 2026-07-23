import { addDays, format } from "date-fns";
import type { LongOffWeekPolicy, PhaseKind, PlanningMode } from "@prisma/client";
import { formatDateKey, parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import {
  phaseTemplateIdForWeek,
  planSeasonMaterialization,
  type LongSeatAction,
  type MaterializeTemplate,
  type PhaseSpan,
  type WeekMaterializationContext,
} from "@/lib/plan/calendar/materialize-templates";
import { isTestWeekAtIndex } from "@/lib/plan/calendar/week-template-resolution";
import {
  applyLongOffWeekPolicy,
  shouldSuppressLongForWeek,
} from "@/lib/plan/season/long-offweek-policy";
import {
  parseLongWeekFlags,
  resolveLongWeekFlagsForSeason,
} from "@/lib/plan/season/long-session-schedule";
import {
  planningModeIncludesLongs,
  resolvePlanningModeForWeek,
} from "@/lib/plan/season/planning-mode";

export type MaterializeSeasonOptions = {
  /** When true, skip weeks that already have any planned sessions. */
  onlyEmptyWeeks?: boolean;
  /** Required: only materialize weeks covered by this phase. */
  phaseId: string;
};

export type MaterializeSeasonResult = {
  weeksMaterialized: number;
  sessionsCreated: number;
  weeksSkipped: number;
};

type PhaseSpanRow = {
  id: string;
  sortOrder: number;
  startWeekIndex: number;
  weekCount: number;
  weeklyTemplateId: string | null;
};

type PhaseLongContext = {
  id: string;
  sortOrder: number;
  startWeekIndex: number;
  weekCount: number;
  phaseKind: PhaseKind;
  planningMode: PlanningMode | null;
  longRideOffWeekPolicy: LongOffWeekPolicy;
  longRunOffWeekPolicy: LongOffWeekPolicy;
  longRideOffWeekEndurancePercent: number | null;
  longRunOffWeekEndurancePercent: number | null;
  longRideStartMin: number | null;
  longRideEndMin: number | null;
  longRunStartMin: number | null;
  longRunEndMin: number | null;
};

/**
 * Derive concrete phase week spans (mirrors the serializer's cursor logic:
 * phases without a stored start chain after the previous phase).
 */
export function phaseSpansWithIds(
  phases: PhaseSpanRow[]
): Array<PhaseSpan & { phaseId: string }> {
  let cursor = 0;
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((p) => p.weekCount > 0)
    .map((p) => {
      const hasStoredStart = p.startWeekIndex >= 0;
      const startWeekIndex = hasStoredStart ? p.startWeekIndex : cursor;
      const endWeekIndex = startWeekIndex + p.weekCount - 1;
      if (!hasStoredStart) cursor += p.weekCount;
      return {
        phaseId: p.id,
        startWeekIndex,
        endWeekIndex,
        weeklyTemplateId: p.weeklyTemplateId,
      };
    });
}

function assignedPhaseSpans(
  phases: PhaseLongContext[]
): Array<PhaseLongContext & { startWeekIndex: number; endWeekIndex: number }> {
  let cursor = 0;
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((p) => p.weekCount > 0)
    .map((p) => {
      const hasStoredStart = p.startWeekIndex >= 0;
      const startWeekIndex = hasStoredStart ? p.startWeekIndex : cursor;
      const endWeekIndex = startWeekIndex + p.weekCount - 1;
      if (!hasStoredStart) cursor += p.weekCount;
      return { ...p, startWeekIndex, endWeekIndex };
    });
}

function phaseAtWeek(
  weekIndex: number,
  phases: Array<PhaseLongContext & { startWeekIndex: number; endWeekIndex: number }>
): (PhaseLongContext & { startWeekIndex: number; endWeekIndex: number }) | null {
  return (
    phases.find(
      (phase) => weekIndex >= phase.startWeekIndex && weekIndex <= phase.endWeekIndex
    ) ?? null
  );
}

function fullLongMinutes(phase: PhaseLongContext | null, metric: "ride" | "run"): number {
  if (!phase) return 0;
  if (metric === "ride") {
    return Math.max(phase.longRideStartMin ?? 0, phase.longRideEndMin ?? 0);
  }
  return Math.max(phase.longRunStartMin ?? 0, phase.longRunEndMin ?? 0);
}

/** Resolve how a LONG template seat should be filled for one discipline/week. */
export function resolveLongSeatAction(input: {
  planningMode: PlanningMode;
  isRestWeek: boolean;
  isTaperPhase: boolean;
  longWeekOn: boolean;
  policy: LongOffWeekPolicy;
  endurancePercent: number;
  fullLongMinutes: number;
}): LongSeatAction | null {
  if (!planningModeIncludesLongs(input.planningMode)) return null;

  const suppress = shouldSuppressLongForWeek({
    isRestWeek: input.isRestWeek,
    isTaperPhase: input.isTaperPhase,
    isDeLoadWeek: input.isRestWeek,
  });
  if (suppress) return { kind: "omit" };
  if (input.longWeekOn) return { kind: "full_long" };

  const off = applyLongOffWeekPolicy({
    policy: input.policy,
    fullLongMinutes: input.fullLongMinutes,
    endurancePercent: input.endurancePercent,
  });
  if (off.kind === "extra_intensity") return { kind: "extra_intensity" };
  if (off.kind === "substitute_endurance") {
    return {
      kind: "substitute_endurance",
      durationMinutes: off.durationMinutes,
    };
  }
  return { kind: "omit" };
}

/**
 * Materialize a phase's assigned weekly template onto the calendar as
 * PlannedSessions (source = TEMPLATE) for weeks in that phase only.
 *
 * By default it replaces the TEMPLATE-sourced sessions in each targeted week
 * (leaving manually-added sessions untouched); with `onlyEmptyWeeks` it only
 * fills weeks that currently have no planned sessions at all.
 *
 * When the season/phase uses separate longs, LONG template seats are rewritten
 * from long-week checkboxes + off-week policy (extra intensity / endurance %).
 */
export async function materializeSeasonTemplates(
  athleteId: string,
  seasonPlanId: string,
  options: MaterializeSeasonOptions
): Promise<MaterializeSeasonResult> {
  const phaseId = options.phaseId;
  if (!phaseId) throw new Error("phaseId is required");

  const plan = await db.seasonPlan.findFirst({
    where: { id: seasonPlanId, athleteId },
    include: {
      phases: true,
      weeks: { orderBy: { weekIndex: "asc" } },
    },
  });
  if (!plan) throw new Error("Season plan not found");

  const targetPhase = plan.phases.find((phase) => phase.id === phaseId);
  if (!targetPhase) throw new Error("Phase not found");

  const spans = phaseSpansWithIds(plan.phases);
  const targetSpan = spans.find((span) => span.phaseId === phaseId);
  if (!targetSpan) {
    throw new Error("Phase is not assigned to any weeks");
  }

  const templateIds = new Set<string>();
  for (const phase of plan.phases) {
    if (phase.weeklyTemplateId) templateIds.add(phase.weeklyTemplateId);
  }
  if (plan.restWeekTemplateId) templateIds.add(plan.restWeekTemplateId);
  if (plan.testWeekTemplateId) templateIds.add(plan.testWeekTemplateId);

  const templateRows = templateIds.size
    ? await db.weeklyScheduleTemplate.findMany({
        where: { id: { in: [...templateIds] }, athleteId },
        include: { items: true },
      })
    : [];

  const templatesById = new Map<string, MaterializeTemplate>(
    templateRows.map((t) => [
      t.id,
      {
        id: t.id,
        items: t.items.map((item) => ({
          weekday: item.weekday,
          discipline: item.discipline,
          title: item.title,
          durationMinutes: item.durationMinutes,
          distanceMeters: item.distanceMeters,
          poolSize: item.poolSize,
          sessionRole: item.sessionRole,
        })),
      },
    ])
  );

  const phaseSpansForLookup: PhaseSpan[] = spans.map(
    ({ startWeekIndex, endWeekIndex, weeklyTemplateId }) => ({
      startWeekIndex,
      endWeekIndex,
      weeklyTemplateId,
    })
  );

  const assignedPhases = assignedPhaseSpans(
    plan.phases.map((phase) => ({
      id: phase.id,
      sortOrder: phase.sortOrder,
      startWeekIndex: phase.startWeekIndex,
      weekCount: phase.weekCount,
      phaseKind: phase.phaseKind,
      planningMode: phase.planningMode,
      longRideOffWeekPolicy: phase.longRideOffWeekPolicy,
      longRunOffWeekPolicy: phase.longRunOffWeekPolicy,
      longRideOffWeekEndurancePercent: phase.longRideOffWeekEndurancePercent,
      longRunOffWeekEndurancePercent: phase.longRunOffWeekEndurancePercent,
      longRideStartMin: phase.longRideStartMin,
      longRideEndMin: phase.longRideEndMin,
      longRunStartMin: phase.longRunStartMin,
      longRunEndMin: phase.longRunEndMin,
    }))
  );

  const seasonDefaultMode = (plan.defaultPlanningMode ?? "BY_DISCIPLINE") as PlanningMode;
  const totalWeeks = plan.weeks.length;
  const longRideFlags = resolveLongWeekFlagsForSeason({
    totalWeeks,
    stored: parseLongWeekFlags(plan.longRideWeekFlags),
  });
  const longRunFlags = resolveLongWeekFlagsForSeason({
    totalWeeks,
    stored: parseLongWeekFlags(plan.longRunWeekFlags),
  });

  const contexts: WeekMaterializationContext[] = plan.weeks
    .filter(
      (week) =>
        week.weekIndex >= targetSpan.startWeekIndex &&
        week.weekIndex <= targetSpan.endWeekIndex
    )
    .map((week) => {
      const phase = phaseAtWeek(week.weekIndex, assignedPhases);
      const planningMode = resolvePlanningModeForWeek(
        week.weekIndex,
        assignedPhases.map((p) => ({
          startWeekIndex: p.startWeekIndex,
          endWeekIndex: p.endWeekIndex,
          planningMode: p.planningMode,
          phaseKind: p.phaseKind,
        })),
        seasonDefaultMode
      );
      const isTaper = phase?.phaseKind === "TAPER";
      const bikeLongSeat = resolveLongSeatAction({
        planningMode,
        isRestWeek: week.isDeLoadWeek,
        isTaperPhase: isTaper,
        longWeekOn: longRideFlags[week.weekIndex] ?? false,
        policy: phase?.longRideOffWeekPolicy ?? "ENDURANCE_PERCENT",
        endurancePercent: phase?.longRideOffWeekEndurancePercent ?? 60,
        fullLongMinutes: fullLongMinutes(phase, "ride"),
      });
      const runLongSeat = resolveLongSeatAction({
        planningMode,
        isRestWeek: week.isDeLoadWeek,
        isTaperPhase: isTaper,
        longWeekOn: longRunFlags[week.weekIndex] ?? false,
        policy: phase?.longRunOffWeekPolicy ?? "ENDURANCE_PERCENT",
        endurancePercent: phase?.longRunOffWeekEndurancePercent ?? 60,
        fullLongMinutes: fullLongMinutes(phase, "run"),
      });

      return {
        weekIndex: week.weekIndex,
        weekStartKey: formatDateKey(week.weekStartDate),
        isDeLoadWeek: week.isDeLoadWeek,
        isTestWeek: isTestWeekAtIndex(week.weekIndex, plan.testWeekFlags),
        phaseTemplateId: phaseTemplateIdForWeek(week.weekIndex, phaseSpansForLookup),
        bikeLongSeat,
        runLongSeat,
      };
    });

  const weekPlans = planSeasonMaterialization(contexts, {
    restTemplateId: plan.restWeekTemplateId,
    testTemplateId: plan.testWeekTemplateId,
    deLoadVolumePercent: plan.deLoadVolumePercent ?? 100,
    templatesById,
  });

  let weeksMaterialized = 0;
  let sessionsCreated = 0;
  let weeksSkipped = 0;

  await db.$transaction(async (tx) => {
    for (const weekPlan of weekPlans) {
      if (weekPlan.sessions.length === 0) continue;

      const weekStartDate = parseDateKey(weekPlan.weekStartKey);
      const weekEndDate = parseDateKey(
        format(addDays(weekStartDate, 6), "yyyy-MM-dd")
      );

      if (options.onlyEmptyWeeks) {
        const existing = await tx.plannedSession.count({
          where: {
            athleteId,
            scheduledDate: { gte: weekStartDate, lte: weekEndDate },
          },
        });
        if (existing > 0) {
          weeksSkipped++;
          continue;
        }
      } else {
        await tx.plannedSession.deleteMany({
          where: {
            athleteId,
            source: "TEMPLATE",
            scheduledDate: { gte: weekStartDate, lte: weekEndDate },
          },
        });
      }

      for (const session of weekPlan.sessions) {
        const targetZones =
          !session.suppressTiz &&
          session.durationMinutes &&
          session.durationMinutes > 0
            ? { "2": session.durationMinutes }
            : undefined;
        const zoneAllocationMissing = computeZoneAllocationMissing(
          session.discipline,
          targetZones
        );

        await tx.plannedSession.create({
          data: {
            athleteId,
            scheduledDate: parseDateKey(session.scheduledDateKey),
            discipline: session.discipline,
            title: session.title,
            distanceMeters: session.distanceMeters,
            poolSize: session.discipline === "SWIM" ? session.poolSize : null,
            source: "TEMPLATE",
            sessionRole: session.sessionRole,
            poolSlotKind: session.poolSlotKind ?? null,
            targetZones,
            zoneAllocationMissing,
          },
        });
        sessionsCreated++;
      }
      weeksMaterialized++;
    }
  });

  return { weeksMaterialized, sessionsCreated, weeksSkipped };
}

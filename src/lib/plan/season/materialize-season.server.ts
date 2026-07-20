import { addDays, format } from "date-fns";
import { formatDateKey, parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import {
  phaseTemplateIdForWeek,
  planSeasonMaterialization,
  type MaterializeTemplate,
  type PhaseSpan,
  type WeekMaterializationContext,
} from "@/lib/plan/calendar/materialize-templates";
import { isTestWeekAtIndex } from "@/lib/plan/calendar/week-template-resolution";

export type MaterializeSeasonOptions = {
  /** When true, skip weeks that already have any planned sessions. */
  onlyEmptyWeeks?: boolean;
};

export type MaterializeSeasonResult = {
  weeksMaterialized: number;
  sessionsCreated: number;
  weeksSkipped: number;
};

/**
 * Derive concrete phase week spans (mirrors the serializer's cursor logic:
 * phases without a stored start chain after the previous phase).
 */
function phaseSpans(
  phases: { sortOrder: number; startWeekIndex: number; weekCount: number; weeklyTemplateId: string | null }[]
): PhaseSpan[] {
  let cursor = 0;
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((p) => p.weekCount > 0)
    .map((p) => {
      const hasStoredStart = p.startWeekIndex >= 0;
      const startWeekIndex = hasStoredStart ? p.startWeekIndex : cursor;
      const endWeekIndex = startWeekIndex + p.weekCount - 1;
      if (!hasStoredStart) cursor += p.weekCount;
      return { startWeekIndex, endWeekIndex, weeklyTemplateId: p.weeklyTemplateId };
    });
}

/**
 * Materialize a season's assigned weekly templates onto the calendar as
 * PlannedSessions (source = TEMPLATE), one pass over every week.
 *
 * By default it replaces the TEMPLATE-sourced sessions in each targeted week
 * (leaving manually-added sessions untouched); with `onlyEmptyWeeks` it only
 * fills weeks that currently have no planned sessions at all.
 */
export async function materializeSeasonTemplates(
  athleteId: string,
  seasonPlanId: string,
  options: MaterializeSeasonOptions = {}
): Promise<MaterializeSeasonResult> {
  const plan = await db.seasonPlan.findFirst({
    where: { id: seasonPlanId, athleteId },
    include: {
      phases: true,
      weeks: { orderBy: { weekIndex: "asc" } },
    },
  });
  if (!plan) throw new Error("Season plan not found");

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

  const spans = phaseSpans(plan.phases);

  const contexts: WeekMaterializationContext[] = plan.weeks.map((week) => ({
    weekIndex: week.weekIndex,
    weekStartKey: formatDateKey(week.weekStartDate),
    isDeLoadWeek: week.isDeLoadWeek,
    isTestWeek: isTestWeekAtIndex(week.weekIndex, plan.testWeekFlags),
    phaseTemplateId: phaseTemplateIdForWeek(week.weekIndex, spans),
  }));

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

import type {
  CalendarWeekTarget,
  CalendarWeekTargetDiscipline,
  TargetDiscipline,
} from "@/components/calendar/types";
import type { PlanningMode } from "@prisma/client";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { serializeSimpleSeasonPlan } from "@/lib/plan/season/simple-planner.server";
import { resolvePlanningModeForWeek } from "@/lib/plan/season/planning-mode";
import { weekIndexForDate } from "@/lib/plan/season/season-dates";
import { parseDateKey } from "@/lib/dates";
import {
  computeCalendarWeekPoolFields,
  needsSlotBudgetBackfill,
  type SimplePhaseCompute,
  type WeekSlotBudgets,
} from "@/lib/plan/season/simple-week-compute";

type SerializedSeason = ReturnType<typeof serializeSimpleSeasonPlan>;
type SerializedPhase = SerializedSeason["phases"][number];
type SerializedWeek = SerializedSeason["weeks"][number];

const TARGET_DISCIPLINES: TargetDiscipline[] = ["SWIM", "BIKE", "RUN"];

const HOURS_KEY: Record<TargetDiscipline, "swimHours" | "bikeHours" | "runHours"> = {
  SWIM: "swimHours",
  BIKE: "bikeHours",
  RUN: "runHours",
};

const SESSIONS_KEY: Record<
  TargetDiscipline,
  "swimSessionsPerWeek" | "bikeSessionsPerWeek" | "runSessionsPerWeek"
> = {
  SWIM: "swimSessionsPerWeek",
  BIKE: "bikeSessionsPerWeek",
  RUN: "runSessionsPerWeek",
};

const INTENSE_KEY: Record<
  TargetDiscipline,
  "swimIntenseDaysPerWeek" | "bikeIntenseDaysPerWeek" | "runIntenseDaysPerWeek"
> = {
  SWIM: "swimIntenseDaysPerWeek",
  BIKE: "bikeIntenseDaysPerWeek",
  RUN: "runIntenseDaysPerWeek",
};

function phaseForWeekIndex(
  phases: SerializedPhase[],
  weekIndex: number
): SerializedPhase | null {
  return (
    phases.find(
      (phase) =>
        phase.startWeekIndex >= 0 &&
        weekIndex >= phase.startWeekIndex &&
        weekIndex <= phase.endWeekIndex
    ) ?? null
  );
}

function disciplineZoneMinutes(
  zoneMinutes: Record<string, number>,
  discipline: TargetDiscipline
): Record<string, number> {
  const prefix = `${discipline}-`;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(zoneMinutes)) {
    if (key.startsWith(prefix) && value > 0) {
      out[key] = value;
    }
  }
  return out;
}

function parseSlotBudgets(raw: unknown): WeekSlotBudgets | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, Record<string, number>>;
  const empty = {
    endurance: 0,
    intensity: 0,
    long: 0,
    substituteEndurance: 0,
    substituteDurationMinutes: 0,
  };
  const read = (key: string) => ({
    endurance: row[key]?.endurance ?? 0,
    intensity: row[key]?.intensity ?? 0,
    long: row[key]?.long ?? 0,
    substituteEndurance: row[key]?.substituteEndurance ?? 0,
    substituteDurationMinutes: row[key]?.substituteDurationMinutes ?? 0,
  });
  return {
    SWIM: read("SWIM"),
    BIKE: read("BIKE"),
    RUN: read("RUN"),
  };
}

function phaseToCompute(phase: SerializedPhase): SimplePhaseCompute {
  return {
    id: phase.id,
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    planningMode: phase.planningMode,
    phaseKind: phase.phaseKind,
    swimSessionsPerWeek: phase.swimSessionsPerWeek,
    bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
    runSessionsPerWeek: phase.runSessionsPerWeek,
    swimIntenseDaysPerWeek: phase.swimIntenseDaysPerWeek,
    bikeIntenseDaysPerWeek: phase.bikeIntenseDaysPerWeek,
    runIntenseDaysPerWeek: phase.runIntenseDaysPerWeek,
    longRideStartMin: phase.longRideStartMin,
    longRideEndMin: phase.longRideEndMin,
    longRunStartMin: phase.longRunStartMin,
    longRunEndMin: phase.longRunEndMin,
    longRideOffWeekPolicy: phase.longRideOffWeekPolicy,
    longRunOffWeekPolicy: phase.longRunOffWeekPolicy,
    longRideOffWeekEndurancePercent: phase.longRideOffWeekEndurancePercent,
    longRunOffWeekEndurancePercent: phase.longRunOffWeekEndurancePercent,
    rampEnabled: phase.rampEnabled,
  };
}

function findSeasonWeek(
  season: SerializedSeason,
  requestedWeekStart: string
): SerializedWeek | undefined {
  const direct = season.weeks.find((week) => week.weekStartDate === requestedWeekStart);
  if (direct) return direct;

  const seasonStart = parseDateKey(season.startDate);
  const weekIndex = weekIndexForDate(seasonStart, parseDateKey(requestedWeekStart));
  if (weekIndex < 0 || weekIndex >= season.totalWeeks) return undefined;

  return season.weeks.find((week) => week.weekIndex === weekIndex);
}

function buildWeekTarget(
  requestedWeekStart: string,
  week: SerializedWeek & {
    longRideMinutes?: number;
    longRunMinutes?: number;
    longSessionZoneMinutes?: Record<string, number>;
    slotBudgets?: unknown;
  },
  phase: SerializedPhase | null,
  planningMode: PlanningMode,
  season: SerializedSeason
): CalendarWeekTarget {
  const byDiscipline: CalendarWeekTargetDiscipline[] = TARGET_DISCIPLINES.map(
    (discipline) => ({
      discipline,
      hours: week[HOURS_KEY[discipline]] ?? 0,
      zoneMinutes: disciplineZoneMinutes(week.zoneMinutes, discipline),
      sessionsPerWeek: phase ? phase[SESSIONS_KEY[discipline]] : 0,
      intenseDaysPerWeek: phase ? phase[INTENSE_KEY[discipline]] : 0,
    })
  );

  const storedSlotBudgets = parseSlotBudgets(week.slotBudgets);
  const phaseCompute = phase ? phaseToCompute(phase) : null;
  let slotBudgets = storedSlotBudgets ?? undefined;
  let longRideMinutes = week.longRideMinutes ?? 0;
  let longRunMinutes = week.longRunMinutes ?? 0;

  if (needsSlotBudgetBackfill(storedSlotBudgets ?? undefined, phaseCompute)) {
    const computed = computeCalendarWeekPoolFields({
      weekIndex: week.weekIndex,
      isRestWeek: week.isRestWeek,
      phase: phaseCompute,
      planningMode,
      context: {
        longRideWeekFlags: season.longRideWeekFlags,
        longRunWeekFlags: season.longRunWeekFlags,
        longAnchors: season.longAnchors,
      },
    });
    slotBudgets = computed.slotBudgets;
    longRideMinutes = computed.longRideMinutes;
    longRunMinutes = computed.longRunMinutes;
  }

  return {
    weekStart: requestedWeekStart,
    weekIndex: week.weekIndex,
    isRestWeek: week.isRestWeek,
    totalHours: week.totalHours,
    phase: phase ? { name: phase.name, color: phase.color } : null,
    strengthSessionsPerWeek: phase ? phase.strengthSessionsPerWeek : 0,
    planningMode,
    longRideMinutes,
    longRunMinutes,
    longSessionZoneMinutes: week.longSessionZoneMinutes ?? {},
    slotBudgets,
    byDiscipline,
    zoneMinutes: week.zoneMinutes,
  };
}

/**
 * Match each calendar Monday (yyyy-MM-dd) to the athlete's active season week,
 * returning the week's hour/TiZ targets plus the covering phase's session and
 * intense-day counts. Weeks with no matching season week are omitted.
 */
export async function getCalendarWeekTargets(
  athleteId: string,
  weekStarts: string[]
): Promise<CalendarWeekTarget[]> {
  if (weekStarts.length === 0) return [];

  const plan = await getSimplePlannerSeason(athleteId);
  if (!plan) return [];

  let season: SerializedSeason;
  try {
    season = serializeSimpleSeasonPlan(plan);
  } catch {
    return [];
  }

  const requested = new Set(weekStarts);

  const targets: CalendarWeekTarget[] = [];
  const defaultPlanningMode = season.defaultPlanningMode ?? "BY_DISCIPLINE";
  const phasePlanningSpans = season.phases.map((p) => ({
    startWeekIndex: p.startWeekIndex,
    endWeekIndex: p.endWeekIndex,
    planningMode: p.planningMode ?? null,
    phaseKind: p.phaseKind,
  }));

  for (const weekStart of requested) {
    const week = findSeasonWeek(season, weekStart);
    if (!week) continue;
    const phase = phaseForWeekIndex(season.phases, week.weekIndex);
    const planningMode = resolvePlanningModeForWeek(
      week.weekIndex,
      phasePlanningSpans,
      defaultPlanningMode
    );
    targets.push(buildWeekTarget(weekStart, week, phase, planningMode, season));
  }

  targets.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return targets;
}

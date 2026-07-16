import type {
  CalendarWeekTarget,
  CalendarWeekTargetDiscipline,
  TargetDiscipline,
} from "@/components/calendar/types";
import type { PlanningMode } from "@prisma/client";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { serializeSimpleSeasonPlan } from "@/lib/plan/season/simple-planner.server";
import { resolvePlanningModeForWeek } from "@/lib/plan/season/planning-mode";
import type { WeekSlotBudgets } from "@/lib/plan/season/simple-week-compute";

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

function buildWeekTarget(
  week: SerializedWeek & {
    longRideMinutes?: number;
    longRunMinutes?: number;
    longSessionZoneMinutes?: Record<string, number>;
    slotBudgets?: unknown;
  },
  phase: SerializedPhase | null,
  planningMode: PlanningMode
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

  return {
    weekStart: week.weekStartDate,
    weekIndex: week.weekIndex,
    isRestWeek: week.isRestWeek,
    totalHours: week.totalHours,
    phase: phase ? { name: phase.name, color: phase.color } : null,
    strengthSessionsPerWeek: phase ? phase.strengthSessionsPerWeek : 0,
    planningMode,
    longRideMinutes: week.longRideMinutes ?? 0,
    longRunMinutes: week.longRunMinutes ?? 0,
    longSessionZoneMinutes: week.longSessionZoneMinutes ?? {},
    slotBudgets: parseSlotBudgets(week.slotBudgets) ?? undefined,
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

  const weekByStart = new Map(season.weeks.map((week) => [week.weekStartDate, week]));
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
    const week = weekByStart.get(weekStart);
    if (!week) continue;
    const phase = phaseForWeekIndex(season.phases, week.weekIndex);
    const planningMode = resolvePlanningModeForWeek(
      week.weekIndex,
      phasePlanningSpans,
      defaultPlanningMode
    );
    targets.push(buildWeekTarget(week, phase, planningMode));
  }

  targets.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return targets;
}

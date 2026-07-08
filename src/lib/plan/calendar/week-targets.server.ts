import type {
  CalendarWeekTarget,
  CalendarWeekTargetDiscipline,
  TargetDiscipline,
} from "@/components/calendar/types";
import { getSimplePlannerSeason } from "@/lib/plan/season/season-plan.server";
import { serializeSimpleSeasonPlan } from "@/lib/plan/season/simple-planner.server";

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

function buildWeekTarget(
  week: SerializedWeek,
  phase: SerializedPhase | null
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
  for (const weekStart of requested) {
    const week = weekByStart.get(weekStart);
    if (!week) continue;
    const phase = phaseForWeekIndex(season.phases, week.weekIndex);
    targets.push(buildWeekTarget(week, phase));
  }

  targets.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return targets;
}

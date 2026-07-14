import { DEFAULT_LOOKBACK_WINDOW_HOURS, type LookbackWindowHours } from "./lookback-window";
import type { InsightSensitivityConfig } from "./sensitivity";

export { DEFAULT_LOOKBACK_WINDOW_HOURS as PRECEDING_WORKOUT_WINDOW_HOURS };
export type { LookbackWindowHours };
export const PRECEDING_WORKOUT_POSITIONS = [1, 2, 3] as const;
export const TRIGGER_DISCIPLINES = ["BIKE", "RUN", "SWIM"] as const;
export const OUTCOME_DISCIPLINES = ["BIKE", "RUN", "SWIM"] as const;
export const TRIGGER_ZONES = [2, 3, 4] as const;

export type ActivityWithZones = {
  startTime: Date;
  discipline: string;
  zoneBreakdowns: { zone: number; minutes: number }[];
  ecos?: number | null;
};

type Band = "overextended" | "typical" | "light" | "insufficient";

export type PrecedingLoadBand = "overextended" | "light";

function percentileRank(value: number, history: number[]): number {
  if (history.length === 0) return 50;
  const sorted = [...history].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  return (below / sorted.length) * 100;
}

function classifyBand(
  value: number,
  history: number[],
  config: InsightSensitivityConfig
): Band {
  if (history.length < config.historyMin) return "insufficient";
  const pct = percentileRank(value, history);
  if (pct >= config.overextendedPct) return "overextended";
  if (pct <= 20) return "light";
  return "typical";
}

export function precedingWorkoutsInWindow(
  allActivities: ActivityWithZones[],
  beforeDate: Date,
  discipline: string,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): ActivityWithZones[] {
  const start = new Date(beforeDate.getTime() - hoursBack * 60 * 60 * 1000);
  return allActivities.filter(
    (activity) =>
      activity.discipline === discipline &&
      activity.startTime >= start &&
      activity.startTime < beforeDate
  );
}

/** Zone minutes in the Nth most recent preceding workout within the lookback window (1 = last one). */
export function zoneMinutesForNthPrecedingWorkoutInWindow(
  allActivities: ActivityWithZones[],
  beforeDate: Date,
  discipline: string,
  zone: number,
  n: number,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number | null {
  const preceding = precedingWorkoutsInWindow(
    allActivities,
    beforeDate,
    discipline,
    hoursBack
  );
  const workout = preceding[preceding.length - n];
  if (!workout) return null;
  return workout.zoneBreakdowns.find((z) => z.zone === zone)?.minutes ?? 0;
}

export function ecosForNthPrecedingWorkoutInWindow(
  allActivities: ActivityWithZones[],
  beforeDate: Date,
  discipline: string,
  n: number,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number | null {
  const preceding = precedingWorkoutsInWindow(
    allActivities,
    beforeDate,
    discipline,
    hoursBack
  );
  const workout = preceding[preceding.length - n];
  if (!workout) return null;
  if (workout.ecos == null || !Number.isFinite(workout.ecos)) return null;
  return workout.ecos;
}

export function priorZoneMinutesHistory(
  allActivities: ActivityWithZones[],
  beforeDate: Date,
  discipline: string,
  zone: number
): number[] {
  const history: number[] = [];
  for (const activity of allActivities) {
    if (activity.startTime >= beforeDate) break;
    if (activity.discipline !== discipline) continue;
    const mins = activity.zoneBreakdowns.find((z) => z.zone === zone)?.minutes ?? 0;
    if (mins > 0) history.push(mins);
  }
  return history;
}

export function priorEcosHistory(
  allActivities: ActivityWithZones[],
  beforeDate: Date,
  discipline: string
): number[] {
  const history: number[] = [];
  for (const activity of allActivities) {
    if (activity.startTime >= beforeDate) break;
    if (activity.discipline !== discipline) continue;
    if (activity.ecos == null || !Number.isFinite(activity.ecos) || activity.ecos <= 0) {
      continue;
    }
    history.push(activity.ecos);
  }
  return history;
}

export function precedingLoadBandRate(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  zone: number,
  config: InsightSensitivityConfig,
  targetBand: PrecedingLoadBand,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number {
  let matches = 0;
  let total = 0;
  for (const item of group) {
    if (!item.activity) continue;
    const history = priorZoneMinutesHistory(
      allActivities,
      item.activity.startTime,
      triggerDiscipline,
      zone
    );
    for (const n of PRECEDING_WORKOUT_POSITIONS) {
      const minutes = zoneMinutesForNthPrecedingWorkoutInWindow(
        allActivities,
        item.activity.startTime,
        triggerDiscipline,
        zone,
        n,
        hoursBack
      );
      if (minutes == null) continue;
      if (classifyBand(minutes, history, config) === targetBand) matches++;
      if (history.length >= config.historyMin) total++;
    }
  }
  return total > 0 ? matches / total : 0;
}

export function overextendedRateForPrecedingWorkouts(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  zone: number,
  config: InsightSensitivityConfig,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number {
  return precedingLoadBandRate(
    group,
    allActivities,
    triggerDiscipline,
    zone,
    config,
    "overextended",
    hoursBack
  );
}

export function lightLoadRateForPrecedingWorkouts(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  zone: number,
  config: InsightSensitivityConfig,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number {
  return precedingLoadBandRate(
    group,
    allActivities,
    triggerDiscipline,
    zone,
    config,
    "light",
    hoursBack
  );
}

export function precedingEcoBandRate(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  config: InsightSensitivityConfig,
  targetBand: PrecedingLoadBand,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number {
  let matches = 0;
  let total = 0;
  for (const item of group) {
    if (!item.activity) continue;
    const history = priorEcosHistory(
      allActivities,
      item.activity.startTime,
      triggerDiscipline
    );
    for (const n of PRECEDING_WORKOUT_POSITIONS) {
      const ecos = ecosForNthPrecedingWorkoutInWindow(
        allActivities,
        item.activity.startTime,
        triggerDiscipline,
        n,
        hoursBack
      );
      if (ecos == null) continue;
      if (classifyBand(ecos, history, config) === targetBand) matches++;
      if (history.length >= config.historyMin) total++;
    }
  }
  return total > 0 ? matches / total : 0;
}

export function overextendedEcoRateForPrecedingWorkouts(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  config: InsightSensitivityConfig,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number {
  return precedingEcoBandRate(
    group,
    allActivities,
    triggerDiscipline,
    config,
    "overextended",
    hoursBack
  );
}

export function lightEcoRateForPrecedingWorkouts(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  config: InsightSensitivityConfig,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
): number {
  return precedingEcoBandRate(
    group,
    allActivities,
    triggerDiscipline,
    config,
    "light",
    hoursBack
  );
}

export function precedingLoadBandRateDebug(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  zone: number,
  config: InsightSensitivityConfig,
  targetBand: PrecedingLoadBand,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
) {
  let matches = 0;
  let total = 0;
  let insufficient = 0;
  for (const item of group) {
    if (!item.activity) continue;
    const history = priorZoneMinutesHistory(
      allActivities,
      item.activity.startTime,
      triggerDiscipline,
      zone
    );
    for (const n of PRECEDING_WORKOUT_POSITIONS) {
      const minutes = zoneMinutesForNthPrecedingWorkoutInWindow(
        allActivities,
        item.activity.startTime,
        triggerDiscipline,
        zone,
        n,
        hoursBack
      );
      if (minutes == null) continue;
      const band = classifyBand(minutes, history, config);
      if (band === targetBand) matches++;
      if (history.length >= config.historyMin) total++;
      else insufficient++;
    }
  }
  return {
    rate: total > 0 ? matches / total : 0,
    matches,
    total,
    insufficient,
  };
}

export function overextendedRateDebug(
  group: Array<{ activity: { startTime: Date } | null }>,
  allActivities: ActivityWithZones[],
  triggerDiscipline: string,
  zone: number,
  config: InsightSensitivityConfig,
  hoursBack: LookbackWindowHours = DEFAULT_LOOKBACK_WINDOW_HOURS
) {
  const result = precedingLoadBandRateDebug(
    group,
    allActivities,
    triggerDiscipline,
    zone,
    config,
    "overextended",
    hoursBack
  );
  return {
    rate: result.rate,
    over: result.matches,
    total: result.total,
    insufficient: result.insufficient,
  };
}

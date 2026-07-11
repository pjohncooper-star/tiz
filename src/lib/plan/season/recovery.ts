import type { ZoneMinutes } from "@/lib/workout/steps";
import { zoneKey } from "@/lib/workout/steps";
import {
  disciplineVolumeMinutes,
  getZoneMinute,
  setZoneMinute,
  type ZoneRampDefaultsByDiscipline,
} from "./simple-tiz";
import { roundHours } from "./volume-curve";

const TRI_DISCIPLINES = ["SWIM", "BIKE", "RUN"] as const;
type TriDiscipline = (typeof TRI_DISCIPLINES)[number];
const ZONES = [1, 2, 3, 4, 5] as const;

export type RecoveryZoneMode = "proportional" | "intensity_shift";

export type RecoverySettings = {
  /** Percent of baseline hours/minutes kept on recovery weeks (e.g. 60). */
  volumePercent: number;
  /** Load weeks before each recovery week in a repeating cadence (3 → 3:1). */
  loadWeeks: number;
  zoneMode: RecoveryZoneMode;
  /** Percent reduction applied to Z3–Z5 when zoneMode is intensity_shift. */
  highZoneCutPercent: number;
};

export const DEFAULT_RECOVERY_SETTINGS: RecoverySettings = {
  volumePercent: 60,
  loadWeeks: 3,
  zoneMode: "proportional",
  highZoneCutPercent: 50,
};

export function parseRecoveryZoneMode(value: unknown): RecoveryZoneMode {
  return value === "intensity_shift" ? "intensity_shift" : "proportional";
}

export function resolveRecoverySettings(plan: {
  deLoadVolumePercent: number;
  recoveryLoadWeeks?: number | null;
  recoveryZoneMode?: string | null;
  recoveryHighZoneCutPercent?: number | null;
}): RecoverySettings {
  const loadWeeks = plan.recoveryLoadWeeks ?? DEFAULT_RECOVERY_SETTINGS.loadWeeks;
  const highZoneCutPercent =
    plan.recoveryHighZoneCutPercent ?? DEFAULT_RECOVERY_SETTINGS.highZoneCutPercent;
  return {
    volumePercent: plan.deLoadVolumePercent,
    loadWeeks: Math.max(1, Math.min(6, loadWeeks)),
    zoneMode: parseRecoveryZoneMode(plan.recoveryZoneMode),
    highZoneCutPercent: Math.max(0, Math.min(100, highZoneCutPercent)),
  };
}

/** Suggest recovery weeks on a repeating load:recovery cadence (default 3:1). */
export function suggestRecoveryWeeks(
  totalWeeks: number,
  loadWeeks: number,
  skipWeekIndices: ReadonlySet<number> = new Set()
): boolean[] {
  const cycle = Math.max(2, loadWeeks + 1);
  const recoveryIndexInCycle = loadWeeks;
  return Array.from({ length: totalWeeks }, (_, weekIndex) => {
    if (skipWeekIndices.has(weekIndex)) return false;
    return weekIndex % cycle === recoveryIndexInCycle;
  });
}

export function applyRecoveryVolumeHours(
  baseline: { swimHours: number; bikeHours: number; runHours: number },
  volumePercent: number
): { swimHours: number; bikeHours: number; runHours: number; totalHours: number } {
  const factor = volumePercent / 100;
  const swimHours = roundHours(baseline.swimHours * factor);
  const bikeHours = roundHours(baseline.bikeHours * factor);
  const runHours = roundHours(baseline.runHours * factor);
  return {
    swimHours,
    bikeHours,
    runHours,
    totalHours: roundHours(swimHours + bikeHours + runHours),
  };
}

function roundMinutes(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeZoneMinutesToBudget(
  zoneMinutes: ZoneMinutes,
  discipline: TriDiscipline,
  budgetMinutes: number
): ZoneMinutes {
  const keys = ZONES.map((zone) => zoneKey(discipline, zone));
  let total = keys.reduce((sum, key) => sum + (zoneMinutes[key] ?? 0), 0);
  if (total <= 0 || budgetMinutes <= 0) {
    const next = { ...zoneMinutes };
    for (const key of keys) next[key] = 0;
    return next;
  }
  if (Math.abs(total - budgetMinutes) < 0.05) return zoneMinutes;

  const next = { ...zoneMinutes };
  const scale = budgetMinutes / total;
  for (const key of keys) {
    next[key] = roundMinutes((next[key] ?? 0) * scale);
  }

  total = keys.reduce((sum, key) => sum + (next[key] ?? 0), 0);
  const drift = roundMinutes(budgetMinutes - total);
  if (drift !== 0) {
    const z1 = zoneKey(discipline, 1);
    next[z1] = roundMinutes(Math.max(0, (next[z1] ?? 0) + drift));
  }
  return next;
}

/** Apply recovery zone rules for one discipline from a non-recovery baseline. */
export function applyRecoveryZonesForDiscipline(
  baseline: ZoneMinutes,
  discipline: TriDiscipline,
  budgetMinutes: number,
  settings: RecoverySettings
): ZoneMinutes {
  const volumeFactor = settings.volumePercent / 100;
  let next = { ...baseline };

  if (settings.zoneMode === "proportional") {
    for (const zone of ZONES) {
      const minutes = getZoneMinute(baseline, discipline, zone);
      next = setZoneMinute(next, discipline, zone, roundMinutes(minutes * volumeFactor));
    }
    return normalizeZoneMinutesToBudget(next, discipline, budgetMinutes);
  }

  const z1 = getZoneMinute(baseline, discipline, 1);
  const z2 = getZoneMinute(baseline, discipline, 2);
  const z3 = getZoneMinute(baseline, discipline, 3);
  const z4 = getZoneMinute(baseline, discipline, 4);
  const z5 = getZoneMinute(baseline, discipline, 5);
  const highCut = settings.highZoneCutPercent / 100;

  const z3Next = roundMinutes(z3 * (1 - highCut));
  const z4Next = roundMinutes(z4 * (1 - highCut));
  const z5Next = roundMinutes(z5 * (1 - highCut));
  const freed = z3 + z4 + z5 - (z3Next + z4Next + z5Next);

  const lowTotal = z1 + z2;
  let z1Next = z1;
  let z2Next = z2;
  if (freed > 0) {
    if (lowTotal > 0) {
      z1Next = roundMinutes(z1 + freed * (z1 / lowTotal));
      z2Next = roundMinutes(z2 + freed * (z2 / lowTotal));
    } else {
      z1Next = roundMinutes(freed / 2);
      z2Next = roundMinutes(freed / 2);
    }
  }

  next = setZoneMinute(next, discipline, 1, z1Next);
  next = setZoneMinute(next, discipline, 2, z2Next);
  next = setZoneMinute(next, discipline, 3, z3Next);
  next = setZoneMinute(next, discipline, 4, z4Next);
  next = setZoneMinute(next, discipline, 5, z5Next);

  return normalizeZoneMinutesToBudget(next, discipline, budgetMinutes);
}

export function applyRecoveryZonesForWeek(
  baseline: ZoneMinutes,
  week: { swimHours: number; bikeHours: number; runHours: number },
  settings: RecoverySettings
): ZoneMinutes {
  let next = { ...baseline };
  for (const discipline of TRI_DISCIPLINES) {
    const budget = disciplineVolumeMinutes(week, discipline);
    next = applyRecoveryZonesForDiscipline(next, discipline, budget, settings);
  }
  return next;
}

/** No-op placeholder for future typing of zone ramp defaults in recovery tests. */
export type { ZoneRampDefaultsByDiscipline };

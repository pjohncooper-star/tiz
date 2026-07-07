import type { Discipline } from "@prisma/client";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";
import {
  isRampOnForDiscipline,
  phaseForWeek,
  rampBaseWeekIndex,
  type SimpleDiscipline,
  type SimplePhaseSpan,
} from "./simple-ramp";

const TRI_DISCIPLINES = ["SWIM", "BIKE", "RUN"] as const;
type TriDiscipline = (typeof TRI_DISCIPLINES)[number];
const ZONES = [1, 2, 3, 4, 5] as const;

const DISCIPLINE_TO_SIMPLE: Record<Discipline, SimpleDiscipline> = {
  SWIM: "swim",
  BIKE: "bike",
  RUN: "run",
  STRENGTH: "run",
};

const DISCIPLINE_HOURS_KEY: Record<
  Discipline,
  "swimHours" | "bikeHours" | "runHours"
> = {
  SWIM: "swimHours",
  BIKE: "bikeHours",
  RUN: "runHours",
  STRENGTH: "runHours",
};

export type MinuteRampDefaults = {
  startMinutes: number;
  peakMinutes: number;
  ratePercent: number;
};

export type DisciplineZoneRampDefaults = Record<
  `z${1 | 2 | 3 | 4 | 5}`,
  MinuteRampDefaults
>;

export type ZoneRampDefaultsByDiscipline = Record<
  "SWIM" | "BIKE" | "RUN",
  DisciplineZoneRampDefaults
>;

export type SimpleWeekWithZones = {
  weekIndex: number;
  isRestWeek: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  zoneMinutes: ZoneMinutes;
  zoneMinutesOverridden?: boolean;
};

function roundMinutes(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyZoneRamp(): MinuteRampDefaults {
  return { startMinutes: 0, peakMinutes: 0, ratePercent: 5 };
}

export function defaultZoneRampDefaults(): ZoneRampDefaultsByDiscipline {
  const disciplineDefaults = (): DisciplineZoneRampDefaults => ({
    z1: { ...emptyZoneRamp() },
    z2: { ...emptyZoneRamp() },
    z3: { ...emptyZoneRamp() },
    z4: { ...emptyZoneRamp() },
    z5: { ...emptyZoneRamp() },
  });
  return {
    SWIM: disciplineDefaults(),
    BIKE: disciplineDefaults(),
    RUN: disciplineDefaults(),
  };
}

export function parseZoneRampDefaults(raw: unknown): ZoneRampDefaultsByDiscipline {
  const defaults = defaultZoneRampDefaults();
  if (!raw || typeof raw !== "object") return defaults;

  for (const discipline of TRI_DISCIPLINES) {
    const row = (raw as Record<string, unknown>)[discipline];
    if (!row || typeof row !== "object") continue;
    for (const zone of ZONES) {
      const key = `z${zone}` as const;
      const cell = (row as Record<string, unknown>)[key];
      if (!cell || typeof cell !== "object") continue;
      const startMinutes = Number((cell as Record<string, unknown>).startMinutes);
      const peakMinutes = Number((cell as Record<string, unknown>).peakMinutes);
      const ratePercent = Number((cell as Record<string, unknown>).ratePercent);
      defaults[discipline][key] = {
        startMinutes: Number.isFinite(startMinutes) ? startMinutes : 0,
        peakMinutes: Number.isFinite(peakMinutes) ? peakMinutes : 0,
        ratePercent: Number.isFinite(ratePercent) ? ratePercent : 5,
      };
    }
  }
  return defaults;
}

export function zoneMinutesForDiscipline(
  zoneMinutes: ZoneMinutes,
  discipline: TriDiscipline
): number {
  return ZONES.reduce((sum, zone) => sum + (zoneMinutes[zoneKey(discipline, zone)] ?? 0), 0);
}

export function disciplineVolumeMinutes(
  week: Pick<SimpleWeekWithZones, "swimHours" | "bikeHours" | "runHours">,
  discipline: TriDiscipline
): number {
  return week[DISCIPLINE_HOURS_KEY[discipline]] * 60;
}

export function zoneMinutesBudget(
  week: Pick<SimpleWeekWithZones, "swimHours" | "bikeHours" | "runHours">,
  discipline: TriDiscipline,
  zoneMinutes: ZoneMinutes
): { used: number; cap: number } {
  const used = zoneMinutesForDiscipline(zoneMinutes, discipline);
  const cap = disciplineVolumeMinutes(week, discipline);
  return { used: roundMinutes(used), cap: roundMinutes(cap) };
}

export function zoneMinutesExceedsVolume(
  week: Pick<SimpleWeekWithZones, "swimHours" | "bikeHours" | "runHours">,
  discipline: TriDiscipline,
  zoneMinutes: ZoneMinutes
): boolean {
  const { used, cap } = zoneMinutesBudget(week, discipline, zoneMinutes);
  return used > cap + 0.05;
}

function rampMinuteValue(
  weeks: SimpleWeekWithZones[],
  weekIndex: number,
  phases: SimplePhaseSpan[],
  discipline: Discipline,
  zone: number,
  defaults: MinuteRampDefaults,
  zoneMinutesKey: string
): number {
  const week = weeks[weekIndex]!;
  const simpleDiscipline = DISCIPLINE_TO_SIMPLE[discipline];
  const phase = phaseForWeek(phases, weekIndex);

  if (week.isRestWeek) {
    return week.zoneMinutes[zoneMinutesKey] ?? defaults.startMinutes;
  }
  if (!isRampOnForDiscipline(phase, simpleDiscipline)) {
    return roundMinutes(defaults.startMinutes);
  }

  const baseIndex = rampBaseWeekIndex(
    weeks.map((item) => ({ weekIndex: item.weekIndex, isRestWeek: item.isRestWeek })),
    weekIndex
  );
  if (baseIndex < 0) {
    return roundMinutes(defaults.startMinutes);
  }

  const base = weeks[baseIndex]!.zoneMinutes[zoneMinutesKey] ?? defaults.startMinutes;
  const rate = defaults.ratePercent / 100;
  return roundMinutes(Math.min(base * (1 + rate), defaults.peakMinutes));
}

export function recalculateSimpleZoneMinutes(
  weeks: SimpleWeekWithZones[],
  phases: SimplePhaseSpan[],
  zoneDefaults: ZoneRampDefaultsByDiscipline
): SimpleWeekWithZones[] {
  const result = weeks.map((week) => ({
    ...week,
    zoneMinutes: { ...week.zoneMinutes },
  }));

  for (const discipline of TRI_DISCIPLINES) {
    const disciplineDefaults = zoneDefaults[discipline];
    for (const zone of ZONES) {
      const key = `z${zone}` as const;
      const def = disciplineDefaults[key];
      const zoneMinutesKey = zoneKey(discipline, zone);

      for (let weekIndex = 0; weekIndex < result.length; weekIndex++) {
        const week = result[weekIndex]!;
        if (week.zoneMinutesOverridden) continue;

        week.zoneMinutes[zoneMinutesKey] = rampMinuteValue(
          result,
          weekIndex,
          phases,
          discipline,
          zone,
          def,
          zoneMinutesKey
        );
      }
    }
  }

  return result.map((week) => ({
    ...week,
    zoneMinutes: clampZoneMinutesToVolume(week),
  }));
}

export function clampZoneMinutesToVolume(week: SimpleWeekWithZones): ZoneMinutes {
  const next: ZoneMinutes = { ...week.zoneMinutes };

  for (const discipline of TRI_DISCIPLINES) {
    const cap = disciplineVolumeMinutes(week, discipline);
    let used = zoneMinutesForDiscipline(next, discipline);
    if (used <= cap) continue;

    const keys = ZONES.map((zone) => zoneKey(discipline, zone));
    for (let index = keys.length - 1; index >= 0 && used > cap; index--) {
      const key = keys[index]!;
      const value = next[key] ?? 0;
      if (value <= 0) continue;
      const overflow = used - cap;
      const trimmed = Math.max(0, value - overflow);
      next[key] = roundMinutes(trimmed);
      used = zoneMinutesForDiscipline(next, discipline);
    }
  }

  return next;
}

export function getZoneMinute(
  zoneMinutes: ZoneMinutes,
  discipline: TriDiscipline,
  zone: number
): number {
  return zoneMinutes[zoneKey(discipline, zone)] ?? 0;
}

export function setZoneMinute(
  zoneMinutes: ZoneMinutes,
  discipline: TriDiscipline,
  zone: number,
  minutes: number
): ZoneMinutes {
  return {
    ...zoneMinutes,
    [zoneKey(discipline, zone)]: roundMinutes(Math.max(0, minutes)),
  };
}

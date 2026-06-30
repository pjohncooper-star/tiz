import type { DeLoadStrategy, Discipline, FocusMode, PhaseFocus } from "@prisma/client";
import { emptyZoneBudget, zoneKey, type ZoneMinutes } from "@/lib/workout/steps";
import { DE_LOAD_INTENSITY_SHIFT, FOCUS_TIZ_PRESETS } from "./constants";
import type { PhaseDisciplineFocus, SeasonPhaseInput } from "./types";

const TRI_DISCIPLINES: Discipline[] = ["SWIM", "BIKE", "RUN"];

type ZonePercents = { z1: number; z2: number; z3: number; z4: number; z5: number };

function normalizePercents(p: ZonePercents): ZonePercents {
  const sum = p.z1 + p.z2 + p.z3 + p.z4 + p.z5;
  if (sum <= 0) return { z1: 100, z2: 0, z3: 0, z4: 0, z5: 0 };
  return {
    z1: (p.z1 / sum) * 100,
    z2: (p.z2 / sum) * 100,
    z3: (p.z3 / sum) * 100,
    z4: (p.z4 / sum) * 100,
    z5: (p.z5 / sum) * 100,
  };
}

function applyDeLoadIntensityShift(
  percents: ZonePercents,
  strategy: DeLoadStrategy,
  isDeLoadWeek: boolean
): ZonePercents {
  if (!isDeLoadWeek) return percents;
  const shift = DE_LOAD_INTENSITY_SHIFT[strategy];
  if (!shift) return percents;

  const highCut = (percents.z4 + percents.z5) * (shift.z4z5Cut / 100);
  const z4 = percents.z4 * (1 - shift.z4z5Cut / 100);
  const z5 = percents.z5 * (1 - shift.z4z5Cut / 100);
  const z1 = percents.z1 + highCut + shift.z1Boost;
  return normalizePercents({ z1, z2: percents.z2, z3: percents.z3, z4, z5 });
}

function focusForDiscipline(
  phase: SeasonPhaseInput,
  discipline: Discipline
): PhaseFocus {
  if (phase.focusMode === "DISCIPLINE") {
    const row = phase.disciplineFocuses?.find((d) => d.discipline === discipline);
    if (row) return row.focus;
  }
  return phase.phaseFocus ?? "AEROBIC_BASE";
}

function disciplineHoursMap(hours: {
  swimHours: number;
  bikeHours: number;
  runHours: number;
}): Record<Discipline, number> {
  return {
    SWIM: hours.swimHours,
    BIKE: hours.bikeHours,
    RUN: hours.runHours,
    STRENGTH: 0,
  };
}

function minutesFromPercents(totalMinutes: number, percents: ZonePercents): number[] {
  const p = normalizePercents(percents);
  return [
    (totalMinutes * p.z1) / 100,
    (totalMinutes * p.z2) / 100,
    (totalMinutes * p.z3) / 100,
    (totalMinutes * p.z4) / 100,
    (totalMinutes * p.z5) / 100,
  ];
}

export function focusPercents(focus: PhaseFocus): ZonePercents {
  return { ...FOCUS_TIZ_PRESETS[focus] };
}

export function computeZoneMinutesForWeek(input: {
  phase: SeasonPhaseInput;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  deLoadStrategy: DeLoadStrategy;
  isDeLoadWeek: boolean;
}): ZoneMinutes {
  const zones = emptyZoneBudget(TRI_DISCIPLINES);
  const hoursByDiscipline = disciplineHoursMap(input);

  for (const discipline of TRI_DISCIPLINES) {
    const focus = focusForDiscipline(input.phase, discipline);
    let percents = focusPercents(focus);
    percents = applyDeLoadIntensityShift(percents, input.deLoadStrategy, input.isDeLoadWeek);

    const totalMinutes = hoursByDiscipline[discipline] * 60;
    const zoneMins = minutesFromPercents(totalMinutes, percents);
    for (let z = 1; z <= 5; z++) {
      const key = zoneKey(discipline, z);
      zones[key] = Math.round(zoneMins[z - 1]! * 10) / 10;
    }
  }

  return zones;
}

export function aggregateZoneMinutesAcrossDisciplines(zones: ZoneMinutes): number[] {
  const totals = [0, 0, 0, 0, 0];
  for (const discipline of TRI_DISCIPLINES) {
    for (let z = 1; z <= 5; z++) {
      totals[z - 1]! += zones[zoneKey(discipline, z)] ?? 0;
    }
  }
  return totals;
}

export type { PhaseDisciplineFocus, FocusMode };

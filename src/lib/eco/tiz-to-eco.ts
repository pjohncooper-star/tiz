import type { Discipline } from "@prisma/client";
import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";
import {
  ecoDisciplineFactor,
  weightedEcoFromZoneMinutes,
} from "@/lib/eco/scores";
import type { EcoZoneMinutes } from "@/lib/eco/compute";

/**
 * Fixed TiZ (5-zone) → ECO (8-zone) minute split.
 * Approximate mid-band alignment of typical %threshold planning bands.
 */
export const TIZ_TO_ECO_SPLIT: Record<
  1 | 2 | 3 | 4 | 5,
  Array<{ ecoZone: number; fraction: number }>
> = {
  1: [
    { ecoZone: 1, fraction: 0.5 },
    { ecoZone: 2, fraction: 0.5 },
  ],
  2: [{ ecoZone: 3, fraction: 1 }],
  3: [{ ecoZone: 4, fraction: 1 }],
  4: [
    { ecoZone: 5, fraction: 0.5 },
    { ecoZone: 6, fraction: 0.5 },
  ],
  5: [
    { ecoZone: 7, fraction: 0.5 },
    { ecoZone: 8, fraction: 0.5 },
  ],
};

export function emptyEcoZoneMinutes(): EcoZoneMinutes {
  const zones: EcoZoneMinutes = {};
  for (let z = 1; z <= 8; z++) zones[z] = 0;
  return zones;
}

/** Pull Z1–Z5 minutes for one discipline from a `DISCIPLINE-n` (or bare `n`) map. */
export function tizMinutesForDiscipline(
  discipline: Discipline,
  zoneMinutes: ZoneMinutes
): Record<number, number> {
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let z = 1; z <= 5; z++) {
    const keyed = zoneMinutes[zoneKey(discipline, z)];
    const bare = zoneMinutes[String(z)];
    out[z] =
      (typeof keyed === "number" ? keyed : 0) +
      (typeof bare === "number" ? bare : 0);
  }
  return out;
}

/** Map TiZ Z1–Z5 minutes into ECO Z1–Z8 via {@link TIZ_TO_ECO_SPLIT}. */
export function mapTizMinutesToEcoZones(
  tizMinutes: Record<number, number>
): EcoZoneMinutes {
  const eco = emptyEcoZoneMinutes();
  for (let z = 1; z <= 5; z++) {
    const minutes = tizMinutes[z] ?? 0;
    if (!(minutes > 0)) continue;
    const splits = TIZ_TO_ECO_SPLIT[z as 1 | 2 | 3 | 4 | 5];
    for (const { ecoZone, fraction } of splits) {
      eco[ecoZone] = (eco[ecoZone] ?? 0) + minutes * fraction;
    }
  }
  return eco;
}

export type ProjectedPlannedEco = {
  ecos: number;
  ecoZoneMinutes: EcoZoneMinutes;
  tizMinutes: number;
  disciplineFactor: number;
};

/**
 * Project session ECO from planned TiZ (workout steps or budget pills).
 * Returns null when discipline is unsupported, zones are missing, or minutes are empty.
 */
export function projectedEcosFromPlannedTiZ(input: {
  discipline: Discipline;
  targetZones?: unknown;
  structuredSteps?: unknown;
  durationHintMinutes?: number | null;
  /** Prefer DB flag when known; also inferred from rollup. */
  zoneAllocationMissing?: boolean;
  transitionBump?: number;
}): ProjectedPlannedEco | null {
  if (
    input.discipline !== "SWIM" &&
    input.discipline !== "BIKE" &&
    input.discipline !== "RUN"
  ) {
    return null;
  }

  const rollup = sessionPlannedZoneRollup(input.discipline, {
    targetZones: input.targetZones,
    structuredSteps: input.structuredSteps,
    durationHintMinutes: input.durationHintMinutes,
  });

  if (input.zoneAllocationMissing || rollup.zoneAllocationMissing) {
    return null;
  }
  if (rollup.totalMinutes <= 0) return null;

  const tiz = tizMinutesForDiscipline(input.discipline, rollup.zones);
  const ecoZoneMinutes = mapTizMinutesToEcoZones(tiz);
  const factor = ecoDisciplineFactor(input.discipline, input.transitionBump ?? 0);
  if (factor == null) return null;

  const ecos = weightedEcoFromZoneMinutes(ecoZoneMinutes, factor);
  if (!(ecos > 0) || !Number.isFinite(ecos)) return null;

  return {
    ecos,
    ecoZoneMinutes,
    tizMinutes: rollup.totalMinutes,
    disciplineFactor: factor,
  };
}

import type { Discipline } from "@prisma/client";
import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import {
  ecoDisciplineFactor,
  weightedEcoFromZoneMinutes,
} from "@/lib/eco/scores";
import type { EcoZoneMinutes } from "@/lib/eco/compute";
import {
  mapTizMinutesToEcoZones,
  tizMinutesForDiscipline,
} from "@/lib/eco/tiz-eco-map";
import {
  ecoMinutesFromStructuredWorkout,
  totalEcoZoneMinutes,
  type PlannedEcoThresholds,
} from "@/lib/eco/structured-eco";

export {
  TIZ_TO_ECO_SPLIT,
  emptyEcoZoneMinutes,
  mapTizMinutesToEcoZones,
  tizMinutesForDiscipline,
} from "@/lib/eco/tiz-eco-map";

export type ProjectedPlannedEco = {
  ecos: number;
  ecoZoneMinutes: EcoZoneMinutes;
  tizMinutes: number;
  disciplineFactor: number;
  /** True when structured absolute targets were scored via assignEcoZone. */
  usedStructuredTargets?: boolean;
};

function hasUsableThresholds(
  thresholds: PlannedEcoThresholds | null | undefined
): thresholds is PlannedEcoThresholds {
  if (!thresholds) return false;
  return (
    (thresholds.ftpWatts != null && thresholds.ftpWatts > 0) ||
    (thresholds.lthrBpm != null && thresholds.lthrBpm > 0) ||
    (thresholds.thresholdPaceSeconds != null &&
      thresholds.thresholdPaceSeconds > 0)
  );
}

/**
 * Project session ECO from planned TiZ (workout steps or budget pills).
 * When structured steps include absolute watts/pace/HR and thresholds are
 * provided, scores those via assignEcoZone; otherwise uses TIZ_TO_ECO_SPLIT.
 */
export function projectedEcosFromPlannedTiZ(input: {
  discipline: Discipline;
  targetZones?: unknown;
  structuredSteps?: unknown;
  durationHintMinutes?: number | null;
  /** Prefer DB flag when known; also inferred from rollup. */
  zoneAllocationMissing?: boolean;
  transitionBump?: number;
  thresholds?: PlannedEcoThresholds | null;
}): ProjectedPlannedEco | null {
  if (
    input.discipline !== "SWIM" &&
    input.discipline !== "BIKE" &&
    input.discipline !== "RUN"
  ) {
    return null;
  }

  const factor = ecoDisciplineFactor(input.discipline, input.transitionBump ?? 0);
  if (factor == null) return null;

  if (input.structuredSteps != null && hasUsableThresholds(input.thresholds)) {
    const structured = ecoMinutesFromStructuredWorkout({
      structuredSteps: input.structuredSteps,
      thresholds: input.thresholds,
    });
    if (structured && totalEcoZoneMinutes(structured.ecoZoneMinutes) > 0) {
      const ecos = weightedEcoFromZoneMinutes(
        structured.ecoZoneMinutes,
        factor
      );
      if (ecos > 0 && Number.isFinite(ecos)) {
        return {
          ecos,
          ecoZoneMinutes: structured.ecoZoneMinutes,
          tizMinutes: structured.scoredMinutes,
          disciplineFactor: factor,
          usedStructuredTargets: true,
        };
      }
    }
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
  const ecos = weightedEcoFromZoneMinutes(ecoZoneMinutes, factor);
  if (!(ecos > 0) || !Number.isFinite(ecos)) return null;

  return {
    ecos,
    ecoZoneMinutes,
    tizMinutes: rollup.totalMinutes,
    disciplineFactor: factor,
    usedStructuredTargets: false,
  };
}

import type { Discipline } from "@prisma/client";
import { db } from "@/lib/db";
import { parseZoneBoundaries } from "@/lib/zones/thresholds";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import type { FlattenPlanningOptions } from "@/lib/workout/workout-tree";

export type DisciplinePaceContext = {
  thresholdPaceSeconds: number | null;
  zoneBoundaries: number[];
};

export type PaceThresholdContext = Partial<
  Record<"RUN" | "SWIM" | "BIKE", DisciplinePaceContext>
>;

/** Latest PACE threshold + boundaries for RUN/SWIM/BIKE (distance / TiZ estimates). */
export async function loadPaceThresholdContext(
  athleteId: string,
  asOf: Date = new Date()
): Promise<PaceThresholdContext> {
  const profiles = await db.thresholdProfile.findMany({
    where: {
      athleteId,
      signalType: "PACE",
      discipline: { in: ["RUN", "SWIM", "BIKE"] },
      effectiveDate: { lte: asOf },
    },
    orderBy: { effectiveDate: "desc" },
  });

  const out: PaceThresholdContext = {};
  for (const discipline of ["RUN", "SWIM", "BIKE"] as const) {
    const profile = profiles.find((p) => p.discipline === discipline);
    if (!profile) {
      out[discipline] = {
        thresholdPaceSeconds: null,
        zoneBoundaries: zoneBoundariesFor(discipline, "PACE"),
      };
      continue;
    }
    let boundaries: number[];
    try {
      boundaries = parseZoneBoundaries(profile.zoneBoundaries);
    } catch {
      boundaries = zoneBoundariesFor(discipline, "PACE");
    }
    out[discipline] = {
      thresholdPaceSeconds:
        profile.thresholdValue > 0 ? profile.thresholdValue : null,
      zoneBoundaries: boundaries,
    };
  }
  return out;
}

export function flattenOptionsForDiscipline(
  discipline: Discipline,
  paceContext?: PaceThresholdContext | null
): FlattenPlanningOptions {
  if (discipline === "RUN" || discipline === "SWIM") {
    const ctx = paceContext?.[discipline];
    return {
      discipline,
      thresholdPaceSeconds: ctx?.thresholdPaceSeconds ?? null,
      zoneBoundaries: ctx?.zoneBoundaries ?? zoneBoundariesFor(discipline, "PACE"),
    };
  }
  if (discipline === "BIKE") {
    return {
      zoneBoundaries: paceContext?.BIKE?.zoneBoundaries ?? zoneBoundariesFor("BIKE", "PACE"),
    };
  }
  return {};
}

/** BIKE PACE threshold is stored as sec/km; convert to m/s for distance derivation. */
export function bikeThresholdSpeedMps(
  paceContext?: PaceThresholdContext | null
): number | null {
  const thresholdPaceSeconds = paceContext?.BIKE?.thresholdPaceSeconds;
  if (thresholdPaceSeconds == null || !(thresholdPaceSeconds > 0)) return null;
  return 1000 / thresholdPaceSeconds;
}

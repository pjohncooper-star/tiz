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
  Record<"RUN" | "SWIM", DisciplinePaceContext>
>;

/** Latest PACE threshold + boundaries for RUN/SWIM (for distance→TiZ estimates). */
export async function loadPaceThresholdContext(
  athleteId: string,
  asOf: Date = new Date()
): Promise<PaceThresholdContext> {
  const profiles = await db.thresholdProfile.findMany({
    where: {
      athleteId,
      signalType: "PACE",
      discipline: { in: ["RUN", "SWIM"] },
      effectiveDate: { lte: asOf },
    },
    orderBy: { effectiveDate: "desc" },
  });

  const out: PaceThresholdContext = {};
  for (const discipline of ["RUN", "SWIM"] as const) {
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
  if (discipline !== "RUN" && discipline !== "SWIM") {
    return {};
  }
  const ctx = paceContext?.[discipline];
  return {
    discipline,
    thresholdPaceSeconds: ctx?.thresholdPaceSeconds ?? null,
    zoneBoundaries: ctx?.zoneBoundaries ?? zoneBoundariesFor(discipline, "PACE"),
  };
}

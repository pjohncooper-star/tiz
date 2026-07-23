import type { Discipline } from "@prisma/client";
import { db } from "@/lib/db";
import { parseZoneBoundaries } from "@/lib/zones/thresholds";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { DEFAULT_ZONE_COUNT } from "@/lib/zones/boundaries";
import type { FlattenPlanningOptions } from "@/lib/workout/workout-tree";

export type DisciplinePaceContext = {
  thresholdPaceSeconds: number | null;
  zoneBoundaries: number[];
  /** Bike FTP for absolute watt → zone mapping (BIKE only). */
  thresholdFtpWatts?: number | null;
  powerZoneBoundaries?: number[];
};

export type PaceThresholdContext = Partial<
  Record<"RUN" | "SWIM" | "BIKE", DisciplinePaceContext>
>;

/** Latest PACE thresholds (+ BIKE POWER FTP) for distance / TiZ estimates. */
export async function loadPaceThresholdContext(
  athleteId: string,
  asOf: Date = new Date()
): Promise<PaceThresholdContext> {
  const profiles = await db.thresholdProfile.findMany({
    where: {
      athleteId,
      OR: [
        { signalType: "PACE", discipline: { in: ["RUN", "SWIM", "BIKE"] } },
        { signalType: "POWER", discipline: "BIKE" },
      ],
      effectiveDate: { lte: asOf },
    },
    orderBy: { effectiveDate: "desc" },
  });

  const out: PaceThresholdContext = {};
  for (const discipline of ["RUN", "SWIM", "BIKE"] as const) {
    const profile = profiles.find(
      (p) => p.discipline === discipline && p.signalType === "PACE"
    );
    if (!profile) {
      out[discipline] = {
        thresholdPaceSeconds: null,
        zoneBoundaries: zoneBoundariesFor(discipline, "PACE"),
      };
    } else {
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
  }

  const powerProfile = profiles.find(
    (p) => p.discipline === "BIKE" && p.signalType === "POWER"
  );
  const bike = out.BIKE ?? {
    thresholdPaceSeconds: null,
    zoneBoundaries: zoneBoundariesFor("BIKE", "PACE"),
  };
  if (powerProfile) {
    let powerBoundaries: number[];
    try {
      powerBoundaries = parseZoneBoundaries(powerProfile.zoneBoundaries);
    } catch {
      powerBoundaries = zoneBoundariesFor("BIKE", "POWER");
    }
    out.BIKE = {
      ...bike,
      thresholdFtpWatts:
        powerProfile.thresholdValue > 0 ? powerProfile.thresholdValue : null,
      powerZoneBoundaries: powerBoundaries,
    };
  } else {
    out.BIKE = {
      ...bike,
      thresholdFtpWatts: null,
      powerZoneBoundaries: zoneBoundariesFor("BIKE", "POWER"),
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
      zoneCount: DEFAULT_ZONE_COUNT,
    };
  }
  if (discipline === "BIKE") {
    const ctx = paceContext?.BIKE;
    return {
      zoneBoundaries: ctx?.zoneBoundaries ?? zoneBoundariesFor("BIKE", "PACE"),
      thresholdFtpWatts: ctx?.thresholdFtpWatts ?? null,
      powerZoneBoundaries:
        ctx?.powerZoneBoundaries ?? zoneBoundariesFor("BIKE", "POWER"),
      // Week TiZ is always Z1–Z5 even if the athlete's POWER profile uses 7 zones.
      zoneCount: DEFAULT_ZONE_COUNT,
    };
  }
  return { zoneCount: DEFAULT_ZONE_COUNT };
}

/** BIKE PACE threshold is stored as sec/km; convert to m/s for distance derivation. */
export function bikeThresholdSpeedMps(
  paceContext?: PaceThresholdContext | null
): number | null {
  const thresholdPaceSeconds = paceContext?.BIKE?.thresholdPaceSeconds;
  if (thresholdPaceSeconds == null || !(thresholdPaceSeconds > 0)) return null;
  return 1000 / thresholdPaceSeconds;
}

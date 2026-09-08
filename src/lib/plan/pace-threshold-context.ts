import { db } from "@/lib/db";
import { parseZoneBoundaries } from "@/lib/zones/thresholds";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { parseRacePaceAnchors } from "@/lib/workout/relative-pace";
import type { PaceThresholdContext } from "@/lib/plan/pace-threshold-flatten";

export type {
  DisciplinePaceContext,
  PaceThresholdContext,
} from "@/lib/plan/pace-threshold-flatten";
export {
  flattenOptionsForDiscipline,
  bikeThresholdSpeedMps,
} from "@/lib/plan/pace-threshold-flatten";

/** Latest PACE thresholds (+ BIKE POWER FTP) for distance / TiZ estimates. */
export async function loadPaceThresholdContext(
  athleteId: string,
  asOf: Date = new Date()
): Promise<PaceThresholdContext> {
  const [profiles, athlete] = await Promise.all([
    db.thresholdProfile.findMany({
      where: {
        athleteId,
        OR: [
          { signalType: "PACE", discipline: { in: ["RUN", "SWIM", "BIKE"] } },
          { signalType: "POWER", discipline: "BIKE" },
        ],
        effectiveDate: { lte: asOf },
      },
      orderBy: { effectiveDate: "desc" },
    }),
    db.athlete
      .findUnique({
        where: { id: athleteId },
        select: { racePaceAnchors: true },
      })
      .catch(() => null),
  ]);

  const out: PaceThresholdContext = {
    racePaces: parseRacePaceAnchors(
      (athlete as { racePaceAnchors?: unknown } | null)?.racePaceAnchors ?? null
    ),
  };
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
        boundaries = parseZoneBoundaries(profile.zoneBoundaries, discipline);
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

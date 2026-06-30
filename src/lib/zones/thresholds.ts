import type { Discipline, SignalType, ThresholdProfile } from "@prisma/client";
import { db } from "@/lib/db";

export async function getThresholdProfileAtDate(
  athleteId: string,
  discipline: Discipline,
  signalType: SignalType,
  activityDate: Date
): Promise<ThresholdProfile | null> {
  return db.thresholdProfile.findFirst({
    where: {
      athleteId,
      discipline,
      signalType,
      effectiveDate: { lte: activityDate },
    },
    orderBy: { effectiveDate: "desc" },
  });
}

export function parseZoneBoundaries(zoneBoundaries: unknown): number[] {
  if (Array.isArray(zoneBoundaries)) return zoneBoundaries as number[];
  if (
    zoneBoundaries &&
    typeof zoneBoundaries === "object" &&
    "boundaries" in zoneBoundaries
  ) {
    return (zoneBoundaries as { boundaries: number[] }).boundaries;
  }
  throw new Error("Invalid zone boundaries");
}

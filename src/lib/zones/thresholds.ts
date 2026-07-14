import type { Discipline, SignalType, ThresholdProfile } from "@prisma/client";
import { db } from "@/lib/db";

export { parseZoneBoundaries } from "./parse-boundaries";

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

import type { Discipline } from "@prisma/client";
import { db } from "@/lib/db";
import { getThresholdProfileAtDate } from "@/lib/zones/thresholds";

function positiveOrNull(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

export async function loadAthleteMaxHeartRateBpm(
  athleteId: string
): Promise<number | null> {
  try {
    const athlete = await db.athlete.findUnique({
      where: { id: athleteId },
      select: { maxHeartRateBpm: true },
    });
    return positiveOrNull(athlete?.maxHeartRateBpm);
  } catch (error) {
    if (
      error instanceof Error &&
      /maxHeartRateBpm|column/.test(error.message)
    ) {
      return null;
    }
    throw error;
  }
}

export async function loadDisciplineLthrBpm(
  athleteId: string,
  discipline: Discipline,
  at: Date
): Promise<number | null> {
  if (discipline === "STRENGTH") return null;
  const profile = await getThresholdProfileAtDate(
    athleteId,
    discipline,
    "HEART_RATE",
    at
  ).catch(() => null);
  return positiveOrNull(profile?.thresholdValue);
}

export async function loadRelativeHrAnchors(
  athleteId: string,
  discipline: Discipline,
  at: Date
): Promise<{ lthrBpm: number | null; maxHeartRateBpm: number | null }> {
  const [lthrBpm, maxHeartRateBpm] = await Promise.all([
    loadDisciplineLthrBpm(athleteId, discipline, at),
    loadAthleteMaxHeartRateBpm(athleteId),
  ]);
  return { lthrBpm, maxHeartRateBpm };
}

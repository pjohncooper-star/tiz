import { db } from "@/lib/db";

export async function isEcoLoadEnabledForAthlete(athleteId: string): Promise<boolean> {
  try {
    const athlete = await db.athlete.findUnique({
      where: { id: athleteId },
      select: { ecoLoadEnabled: true },
    });
    return athlete?.ecoLoadEnabled ?? false;
  } catch (error) {
    if (
      error instanceof Error &&
      /ecoLoadEnabled|EcoLoadEnabled|column/.test(error.message)
    ) {
      return false;
    }
    throw error;
  }
}

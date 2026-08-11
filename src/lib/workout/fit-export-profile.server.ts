import type { Discipline } from "@prisma/client";
import { db } from "@/lib/db";
import { getThresholdProfileAtDate } from "@/lib/zones/thresholds";
import type { FitExportThresholds } from "@/lib/workout/fit-target-codec";
import { parseSwimEquipmentCatalog } from "@/lib/swim/equipment-catalog";
import { parseRacePaceAnchors } from "@/lib/workout/relative-pace";

export async function loadFitExportThresholds(
  athleteId: string,
  discipline: Discipline,
  at: Date
): Promise<FitExportThresholds> {
  const thresholds: FitExportThresholds = {};

  if (discipline === "BIKE") {
    const power = await getThresholdProfileAtDate(athleteId, "BIKE", "POWER", at);
    if (power?.thresholdValue && power.thresholdValue > 0) {
      thresholds.ftpWatts = power.thresholdValue;
    }
  }

  const hr = await getThresholdProfileAtDate(
    athleteId,
    discipline,
    "HEART_RATE",
    at
  );
  if (hr?.thresholdValue && hr.thresholdValue > 0) {
    thresholds.maxHeartRateBpm = hr.thresholdValue;
  }

  if (discipline === "RUN" || discipline === "SWIM") {
    const pace = await getThresholdProfileAtDate(
      athleteId,
      discipline,
      "PACE",
      at
    );
    if (pace?.thresholdValue && pace.thresholdValue > 0) {
      thresholds.thresholdPaceSecondsPerKm = pace.thresholdValue;
    }
  }

  try {
    const athlete = await db.athlete.findUnique({
      where: { id: athleteId },
      select: { racePaceAnchors: true, swimEquipmentCatalog: true },
    });
    if (discipline === "RUN" || discipline === "SWIM") {
      thresholds.racePaces = parseRacePaceAnchors(
        (athlete as { racePaceAnchors?: unknown } | null)?.racePaceAnchors ?? null
      );
    }
    if (discipline === "SWIM") {
      thresholds.swimEquipmentCatalog = parseSwimEquipmentCatalog(
        athlete?.swimEquipmentCatalog ?? null
      );
    }
  } catch {
    if (discipline === "RUN" || discipline === "SWIM") {
      thresholds.racePaces = {};
    }
    if (discipline === "SWIM") {
      thresholds.swimEquipmentCatalog = parseSwimEquipmentCatalog(null);
    }
  }

  return thresholds;
}

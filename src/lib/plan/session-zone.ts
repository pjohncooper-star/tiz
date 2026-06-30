import { sessionPlannedZoneRollup } from "@/lib/plan/rollup";
import type { Discipline } from "@prisma/client";

export function computeZoneAllocationMissing(
  discipline: Discipline,
  targetZones: unknown,
  durationHintMinutes?: number | null,
  structuredSteps?: unknown
): boolean {
  return sessionPlannedZoneRollup(discipline, {
    targetZones,
    structuredSteps,
    durationHintMinutes,
  }).zoneAllocationMissing;
}

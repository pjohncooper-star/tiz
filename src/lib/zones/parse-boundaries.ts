import type { Discipline } from "@prisma/client";
import { coalesceLegacyPaceBoundaries } from "@/lib/zones/boundaries";

export function parseZoneBoundaries(
  zoneBoundaries: unknown,
  discipline?: Discipline
): number[] {
  let boundaries: number[];
  if (Array.isArray(zoneBoundaries)) {
    boundaries = zoneBoundaries as number[];
  } else if (
    zoneBoundaries &&
    typeof zoneBoundaries === "object" &&
    "boundaries" in zoneBoundaries
  ) {
    boundaries = (zoneBoundaries as { boundaries: number[] }).boundaries;
  } else {
    throw new Error("Invalid zone boundaries");
  }
  // Soft-upgrade known inverted / interim pace defaults.
  return coalesceLegacyPaceBoundaries(boundaries, discipline);
}

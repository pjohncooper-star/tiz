import { coalesceLegacyPaceBoundaries } from "@/lib/zones/boundaries";

export function parseZoneBoundaries(zoneBoundaries: unknown): number[] {
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
  // Soft-upgrade known inverted legacy pace defaults (Z4/Z5 at 100% speed).
  return coalesceLegacyPaceBoundaries(boundaries);
}

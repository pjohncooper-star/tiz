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

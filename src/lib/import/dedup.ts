import { createHash } from "crypto";
import type { Discipline } from "@prisma/client";

function hashPayload(parts: (string | number)[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

/** Truncate to UTC minute for stable cross-source matching. */
export function normalizeStartTimeForMatch(startTime: Date): Date {
  const ms = 60_000;
  return new Date(Math.floor(startTime.getTime() / ms) * ms);
}

export function buildDedupFingerprint(
  discipline: Discipline,
  startTime: Date,
  durationSeconds: number,
  distanceMeters?: number | null
): string {
  return hashPayload([
    discipline,
    startTime.toISOString(),
    durationSeconds,
    distanceMeters?.toFixed(0) ?? "na",
  ]);
}

/** Fingerprint for new writes — minute-truncated start, Strava-aligned duration. */
export function buildNormalizedDedupFingerprint(
  discipline: Discipline,
  startTime: Date,
  durationSeconds: number,
  distanceMeters?: number | null
): string {
  return hashPayload([
    discipline,
    normalizeStartTimeForMatch(startTime).toISOString(),
    durationSeconds,
    distanceMeters?.toFixed(0) ?? "na",
  ]);
}

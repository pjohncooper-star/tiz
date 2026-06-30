import { createHash } from "crypto";
import type { Discipline } from "@prisma/client";

export function buildDedupFingerprint(
  discipline: Discipline,
  startTime: Date,
  durationSeconds: number,
  distanceMeters?: number | null
): string {
  const payload = [
    discipline,
    startTime.toISOString(),
    durationSeconds,
    distanceMeters?.toFixed(0) ?? "na",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

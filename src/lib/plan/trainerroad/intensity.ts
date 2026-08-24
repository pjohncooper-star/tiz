import type { SessionRole } from "@prisma/client";

/** Easy when IF is strictly below this (Active Recovery / very easy Endurance). */
export const TR_EASY_IF_MAX = 0.6;
/** Intensity when IF is at least this (Sweet Spot / Threshold / most VO2). */
export const TR_INTENSITY_IF_MIN = 0.8;
/** Long only when duration is at least this and the session is not quality. */
export const TR_LONG_MINUTES = 120;

const INTENSITY_DESCRIPTION =
  /sweet\s*spot|\bthreshold\b|\bvo2\b|\bvo₂\b|over[\s-]?under|\banaerobic\b/i;

/**
 * True when DESCRIPTION (not SUMMARY) names a quality zone.
 * Strips "Functional Threshold Power" so FTP copy does not false-positive.
 */
export function trainerRoadDescriptionForcesIntensity(description: string): boolean {
  const stripped = description.replace(/functional\s+threshold(\s+power)?/gi, " ");
  return INTENSITY_DESCRIPTION.test(stripped);
}

export function parseTrainerRoadIntensityFactor(description: string): number | null {
  const match = /\bIF\s+([\d.]+)/i.exec(description);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!.replace(/\.$/, ""));
  return Number.isFinite(value) ? value : null;
}

export function parseTrainerRoadTss(description: string): number | null {
  const match = /\bTSS\s+(\d+)/i.exec(description);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 10);
  return Number.isFinite(value) ? value : null;
}

/** `H:MM - Name` prefix used by TrainerRoad SUMMARY. */
export function parseTrainerRoadDurationMinutes(summary: string): number | null {
  const match = /^(\d+):(\d{2})\s*-\s*/.exec(summary.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1]!, 10);
  const minutes = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function trainerRoadTitleWithoutDuration(summary: string): string {
  return summary.trim().replace(/^\d+:\d{2}\s*-\s*/, "").trim();
}

/** TSS = IF² × hours × 100 → minutes = TSS / (IF² × 100) × 60 */
export function durationMinutesFromTssIf(tss: number, intensityFactor: number): number | null {
  if (!(tss > 0) || !(intensityFactor > 0)) return null;
  const minutes = (tss / (intensityFactor * intensityFactor * 100)) * 60;
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
}

/**
 * Infer TiZ session role from TR DESCRIPTION metrics.
 * Never uses the workout title (TR names are mountains and false-positive "rest").
 */
export function inferTrainerRoadSessionRole(input: {
  intensityFactor: number | null;
  durationMinutes: number | null;
  tss: number | null;
  description: string;
}): SessionRole | null {
  if (trainerRoadDescriptionForcesIntensity(input.description)) {
    return "INTENSITY";
  }

  const iff = input.intensityFactor;
  if (iff == null) {
    return input.tss != null ? "INTENSITY" : null;
  }

  if (iff < TR_EASY_IF_MAX) return "EASY";
  if (iff >= TR_INTENSITY_IF_MIN) return "INTENSITY";
  if (input.durationMinutes != null && input.durationMinutes >= TR_LONG_MINUTES) {
    return "LONG";
  }
  return "MODERATE";
}

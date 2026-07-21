import type { Discipline, SessionRole, SignalType } from "@prisma/client";
import type { ZoneMinutes } from "@/lib/workout/steps";
import { zoneKey } from "@/lib/workout/steps";
import type { NormalizedStreams } from "@/lib/zones/compute";
import { velocityToPaceSecPer100m, velocityToPaceSecPerKm } from "@/lib/units/pace";

export type SessionRoleValue = SessionRole;

export const SESSION_ROLES: SessionRole[] = ["EASY", "MODERATE", "INTENSITY", "LONG"];

export const SESSION_ROLE_LABELS: Record<SessionRole, string> = {
  EASY: "Easy",
  MODERATE: "Moderate",
  INTENSITY: "Intensity",
  LONG: "Long",
};

/** Coaching intent for each role — used in weekly template setup and skeleton drop picker. */
export const SESSION_ROLE_DESCRIPTIONS: Record<SessionRole, string> = {
  EASY: "Recovery or light aerobic — mostly easy effort (Z1–2).",
  MODERATE: "Steady endurance — default training day (mostly Z2).",
  INTENSITY: "Quality day — intervals, threshold, or hard efforts (Z3+).",
  LONG: "Long aerobic session — duration-focused endurance.",
};

const LONG_TITLE =
  /\b(long run|long ride|long swim|long bike|long\b|endurance ride|aerobic endurance)\b/i;
const INTENSITY_TITLE =
  /\b(interval|intervals|threshold|tempo|vo2|vo₂|hard|intensity|speed|fartlek|sweet.?spot|over.?under|race|time.?trial|tt\b|brick|anaerobic|sprint|repeats?|track)\b/i;
const EASY_TITLE =
  /\b(easy|recovery|rest|aerobic recovery|shake.?out|cool.?down|cooldown|spin|active recovery|junk miles)\b/i;

const LONG_DURATION_MINUTES: Partial<Record<Discipline, number>> = {
  RUN: 75,
  BIKE: 90,
  SWIM: 45,
};

/** % of threshold: below → easy bias; above → intensity bias. Uses discipline primary metric. */
const EASY_PCT_MAX = 82;
const INTENSITY_PCT_MIN = 95;

export function nextSessionRole(role: SessionRole): SessionRole {
  const index = SESSION_ROLES.indexOf(role);
  return SESSION_ROLES[(index + 1) % SESSION_ROLES.length] ?? "MODERATE";
}

export function hardZoneMinutes(zoneMinutes: ZoneMinutes, discipline: Discipline): number {
  let total = 0;
  for (const zone of [3, 4, 5]) {
    total += zoneMinutes[zoneKey(discipline, zone)] ?? 0;
  }
  return total;
}

function meanPositive(data: number[] | undefined): number | null {
  if (!data || data.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const v of data) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      sum += v;
      n += 1;
    }
  }
  return n > 0 ? sum / n : null;
}

/**
 * Estimate intensity as % of threshold from streams/meta — never uses ZoneBreakdown
 * (safe inside the same compute pass that produces zones).
 * Pace uses threshold/pace × 100 (speed %); HR/power use value/threshold × 100.
 */
export function estimateIntensityPctOfThreshold(input: {
  discipline: Discipline;
  signal: SignalType;
  thresholdValue: number;
  streams: NormalizedStreams;
}): number | null {
  const { discipline, signal, thresholdValue, streams } = input;
  if (!(thresholdValue > 0)) return null;

  if (signal === "HEART_RATE") {
    const avg =
      streams.meta?.avgHeartRate && streams.meta.avgHeartRate > 0
        ? streams.meta.avgHeartRate
        : meanPositive(streams.heartrate?.data);
    if (avg == null) return null;
    return (avg / thresholdValue) * 100;
  }

  if (signal === "POWER") {
    const avg =
      streams.meta?.avgPower && streams.meta.avgPower > 0
        ? streams.meta.avgPower
        : meanPositive(streams.watts?.data);
    if (avg == null) return null;
    return (avg / thresholdValue) * 100;
  }

  // PACE: threshold is sec per km / 100m; higher speed % = harder.
  let avgPaceSec: number | null = null;
  if (streams.meta?.avgSpeedMps && streams.meta.avgSpeedMps > 0) {
    avgPaceSec =
      discipline === "SWIM"
        ? velocityToPaceSecPer100m(streams.meta.avgSpeedMps)
        : velocityToPaceSecPerKm(streams.meta.avgSpeedMps);
  } else {
    const mps = meanPositive(streams.velocity?.data);
    if (mps != null && mps > 0) {
      avgPaceSec =
        discipline === "SWIM"
          ? velocityToPaceSecPer100m(mps)
          : velocityToPaceSecPerKm(mps);
    }
  }
  if (avgPaceSec == null || !(avgPaceSec > 0)) return null;
  return (thresholdValue / avgPaceSec) * 100;
}

function roleFromStreamIntensity(pct: number | null, meta?: NormalizedStreams["meta"]): SessionRole | null {
  const rpe = meta?.workoutRpe;
  // Garmin RPE × 10 (10 = 1/10 … 100 = 10/10)
  if (typeof rpe === "number" && rpe > 0) {
    if (rpe <= 35) return "EASY";
    if (rpe >= 70) return "INTENSITY";
  }
  const feel = meta?.workoutFeel;
  if (typeof feel === "number" && feel > 0) {
    // 0–100 feel; low = harder on some Garmin devices — treat extremes only.
    if (feel <= 25) return "INTENSITY";
    if (feel >= 80) return "EASY";
  }
  if (pct == null) return null;
  if (pct < EASY_PCT_MAX) return "EASY";
  if (pct >= INTENSITY_PCT_MIN) return "INTENSITY";
  return null;
}

export function inferSessionRole(input: {
  title: string;
  discipline: Discipline;
  durationMinutes?: number | null;
  zoneMinutes?: ZoneMinutes;
  /** Optional pre-zone stream heuristic (discipline primary threshold). */
  streams?: NormalizedStreams;
  primarySignal?: SignalType;
  thresholdValue?: number | null;
}): SessionRole {
  const title = input.title.trim();
  if (LONG_TITLE.test(title)) return "LONG";
  if (INTENSITY_TITLE.test(title)) return "INTENSITY";
  if (EASY_TITLE.test(title)) return "EASY";

  const duration = input.durationMinutes ?? 0;
  const longThreshold = LONG_DURATION_MINUTES[input.discipline];
  if (longThreshold != null && duration >= longThreshold) return "LONG";

  if (input.zoneMinutes) {
    const hard = hardZoneMinutes(input.zoneMinutes, input.discipline);
    const total = Object.values(input.zoneMinutes).reduce((sum, minutes) => sum + minutes, 0);
    if (hard >= 12 || (total > 0 && hard / total >= 0.25)) return "INTENSITY";
  }

  if (
    input.streams &&
    input.primarySignal &&
    input.thresholdValue != null &&
    input.thresholdValue > 0
  ) {
    const pct = estimateIntensityPctOfThreshold({
      discipline: input.discipline,
      signal: input.primarySignal,
      thresholdValue: input.thresholdValue,
      streams: input.streams,
    });
    const fromStream = roleFromStreamIntensity(pct, input.streams.meta);
    if (fromStream) return fromStream;
  }

  return "MODERATE";
}

/** Use stored role when set to a planning hint; infer when still moderate/default. */
export function resolveDisplaySessionRole(input: {
  sessionRole: SessionRole;
  title: string;
  discipline: Discipline;
  durationMinutes?: number | null;
  zoneMinutes?: ZoneMinutes;
  streams?: NormalizedStreams;
  primarySignal?: SignalType;
  thresholdValue?: number | null;
}): SessionRole {
  if (input.sessionRole !== "MODERATE") return input.sessionRole;
  return inferSessionRole(input);
}

export function sessionRoleShowsBadge(role: SessionRole): boolean {
  return role === "INTENSITY" || role === "LONG" || role === "EASY";
}

export function sessionRoleAccentClass(role: SessionRole): string {
  switch (role) {
    case "INTENSITY":
      return "border-l-4 border-l-amber-500 dark:border-l-amber-600";
    case "LONG":
      return "border-l-4 border-l-violet-500 dark:border-l-violet-600";
    case "EASY":
      return "border-l-4 border-l-emerald-400 dark:border-l-emerald-700";
    default:
      return "";
  }
}

export function sessionRoleBadgeClass(role: SessionRole): string {
  switch (role) {
    case "INTENSITY":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200";
    case "LONG":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950/70 dark:text-violet-200";
    case "EASY":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

export function roleFromStructuredWorkout(zoneMinutes: ZoneMinutes, discipline: Discipline): SessionRole | null {
  const inferred = inferSessionRole({
    title: "",
    discipline,
    zoneMinutes,
  });
  return inferred === "MODERATE" ? null : inferred;
}

import { formatZoneMinutes } from "@/lib/workout/steps";

export type ProgressTone = "good" | "warn" | "low" | "high" | "neutral";

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "—";
  return formatZoneMinutes(minutes);
}

export function formatPercent(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return "—";
  return `${Math.round(percent)}%`;
}

/** Signed minutes such as "+20m" or "-1h 5m"; "on target" within a minute. */
export function formatMinuteDelta(minutes: number): string {
  if (Math.abs(minutes) < 1) return "on target";
  const sign = minutes > 0 ? "+" : "-";
  return `${sign}${formatZoneMinutes(Math.abs(minutes))}`;
}

/** Volume: close to target is good; well under is low; well over is flagged as high. */
export function volumeTone(percent: number | null): ProgressTone {
  if (percent == null) return "neutral";
  if (percent < 70) return "low";
  if (percent < 90) return "warn";
  if (percent <= 115) return "good";
  return "high";
}

/** Adherence and zone match: more is better. */
export function scoreTone(percent: number | null): ProgressTone {
  if (percent == null) return "neutral";
  if (percent < 60) return "low";
  if (percent < 85) return "warn";
  return "good";
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (key: string, withYear: boolean) =>
    new Date(`${key}T12:00:00.000Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
  return `${fmt(weekStart, false)} – ${fmt(weekEnd, true)}`;
}

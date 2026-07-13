import type { Discipline, SessionRole } from "@prisma/client";
import type { ZoneMinutes } from "@/lib/workout/steps";
import { zoneKey } from "@/lib/workout/steps";

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

const LONG_TITLE = /\b(long run|long ride|long swim|long bike|long\b)/i;
const INTENSITY_TITLE =
  /\b(interval|intervals|threshold|tempo|vo2|vo₂|hard|intensity|speed|fartlek|sweet spot|over.?under)\b/i;
const EASY_TITLE = /\b(easy|recovery|rest|aerobic recovery)\b/i;

const LONG_DURATION_MINUTES: Partial<Record<Discipline, number>> = {
  RUN: 75,
  BIKE: 90,
  SWIM: 45,
};

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

export function inferSessionRole(input: {
  title: string;
  discipline: Discipline;
  durationMinutes?: number | null;
  zoneMinutes?: ZoneMinutes;
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

  return "MODERATE";
}

/** Use stored role when set to a planning hint; infer when still moderate/default. */
export function resolveDisplaySessionRole(input: {
  sessionRole: SessionRole;
  title: string;
  discipline: Discipline;
  durationMinutes?: number | null;
  zoneMinutes?: ZoneMinutes;
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

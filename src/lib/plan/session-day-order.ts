/** Prisma orderBy for calendar lists: date → timed clock → untimed sort → title. */
export const PLANNED_SESSION_CALENDAR_ORDER_BY = [
  { scheduledDate: "asc" as const },
  { scheduledTimeMinutes: { sort: "asc" as const, nulls: "last" as const } },
  { daySortOrder: "asc" as const },
  { title: "asc" as const },
];

export function isValidScheduledTimeMinutes(value: number | null | undefined): boolean {
  if (value == null) return true;
  return Number.isInteger(value) && value >= 0 && value <= 1439;
}

/** Parse HH:MM (24h) to minutes from midnight; empty → null. */
export function parseTimeInputToMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Format minutes from midnight as HH:MM (24h). */
export function formatScheduledTimeMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const clamped = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Display like 6:30 AM / 14:05 for calendar cards. */
export function formatScheduledTimeLabel(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const clamped = Math.max(0, Math.min(1439, Math.floor(minutes)));
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export type DayOrderSession = {
  id: string;
  scheduledTimeMinutes: number | null;
  daySortOrder: number;
  title: string;
};

/**
 * Compare two sessions for within-day order:
 * timed (by clock) before untimed (by daySortOrder), then title.
 */
export function compareSessionsForDayOrder(a: DayOrderSession, b: DayOrderSession): number {
  const aTimed = a.scheduledTimeMinutes != null;
  const bTimed = b.scheduledTimeMinutes != null;
  if (aTimed && bTimed) {
    if (a.scheduledTimeMinutes !== b.scheduledTimeMinutes) {
      return (a.scheduledTimeMinutes as number) - (b.scheduledTimeMinutes as number);
    }
  } else if (aTimed !== bTimed) {
    return aTimed ? -1 : 1;
  } else if (a.daySortOrder !== b.daySortOrder) {
    return a.daySortOrder - b.daySortOrder;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Validate a same-day reorder of untimed sessions.
 * `orderedUntimedIds` must be a permutation of all untimed session ids for the day.
 * Timed sessions cannot appear in the reorder list.
 */
export function validateUntimedDayReorder(input: {
  daySessions: DayOrderSession[];
  orderedUntimedIds: string[];
}): { ok: true } | { ok: false; error: string } {
  const { daySessions, orderedUntimedIds } = input;
  const timedIds = new Set(
    daySessions.filter((s) => s.scheduledTimeMinutes != null).map((s) => s.id)
  );
  for (const id of orderedUntimedIds) {
    if (timedIds.has(id)) {
      return { ok: false, error: "Timed sessions cannot be reordered by drag" };
    }
  }
  const untimedIds = daySessions
    .filter((s) => s.scheduledTimeMinutes == null)
    .map((s) => s.id)
    .sort();
  const requested = [...orderedUntimedIds].sort();
  if (
    untimedIds.length !== requested.length ||
    untimedIds.some((id, i) => id !== requested[i])
  ) {
    return { ok: false, error: "orderedSessionIds must include each untimed session once" };
  }
  return { ok: true };
}

/** Assign contiguous daySortOrder values (0..n-1) from an ordered id list. */
export function daySortOrdersFromIds(orderedIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  orderedIds.forEach((id, index) => map.set(id, index));
  return map;
}

import type { Discipline } from "@prisma/client";
import { workoutTagNames } from "@/lib/plan/workout-tags";

export type TrainingSearchHitKind = "session" | "activity";

export type TrainingSearchHit = {
  kind: TrainingSearchHitKind;
  id: string;
  title: string;
  discipline: Discipline;
  dateKey: string;
  durationMinutes: number | null;
  distanceMeters: number | null;
  tags: string[];
  weekHref: string;
  detailHref: string;
};

export type TrainingSearchCursor = {
  dateKey: string;
  kind: TrainingSearchHitKind;
  id: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function encodeSearchCursor(cursor: TrainingSearchCursor): string {
  return `${cursor.dateKey}|${cursor.kind}|${cursor.id}`;
}

export function decodeSearchCursor(raw: string | null | undefined): TrainingSearchCursor | null {
  if (!raw) return null;
  const [dateKey, kind, id] = raw.split("|");
  if (!dateKey || !DATE_KEY.test(dateKey) || !id) return null;
  if (kind !== "session" && kind !== "activity") return null;
  return { dateKey, kind, id };
}

/** Sort key: newer dates first, then kind, then id for stability. */
export function compareSearchHitsNewestFirst(a: TrainingSearchHit, b: TrainingSearchHit): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
  if (a.kind !== b.kind) return a.kind === "session" ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function isAfterSearchCursor(
  hit: TrainingSearchHit,
  cursor: TrainingSearchCursor
): boolean {
  if (hit.dateKey !== cursor.dateKey) return hit.dateKey < cursor.dateKey;
  if (hit.kind !== cursor.kind) {
    // session before activity at same date in newest-first ordering
    if (cursor.kind === "session") return hit.kind === "activity";
    return false;
  }
  return hit.id > cursor.id;
}

export function parseSearchTagFilter(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return workoutTagNames(
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

export function parseOptionalPositiveNumber(raw: string | null): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

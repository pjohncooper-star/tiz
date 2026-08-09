export const WORKOUT_TAG_MAX_LENGTH = 40;
export const WORKOUT_TAG_MAX_COUNT = 20;

export type NormalizedWorkoutTag = {
  /** Lowercase unique key. */
  name: string;
  /** Display casing from first use / user input. */
  label: string;
};

/** Normalize a single free-text tag. Returns null when empty or too long. */
export function normalizeWorkoutTag(raw: string): NormalizedWorkoutTag | null {
  const label = raw.trim().replace(/\s+/g, " ");
  if (!label || label.length > WORKOUT_TAG_MAX_LENGTH) return null;
  return { name: label.toLowerCase(), label };
}

/**
 * Normalize a list of tags: drop invalids, dedupe by lowercase name,
 * preserve first-seen display label and order.
 */
export function normalizeWorkoutTags(raw: readonly string[]): NormalizedWorkoutTag[] {
  const seen = new Set<string>();
  const out: NormalizedWorkoutTag[] = [];
  for (const item of raw) {
    const tag = normalizeWorkoutTag(item);
    if (!tag || seen.has(tag.name)) continue;
    seen.add(tag.name);
    out.push(tag);
    if (out.length >= WORKOUT_TAG_MAX_COUNT) break;
  }
  return out;
}

/** Tag names (lowercase) ready to persist on PlannedSession.tags. */
export function workoutTagNames(raw: readonly string[]): string[] {
  return normalizeWorkoutTags(raw).map((t) => t.name);
}

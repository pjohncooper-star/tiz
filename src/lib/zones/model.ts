/**
 * The canonical training-zone model. Everything that counts, budgets, charts, or
 * prescribes zones uses these — activity scoring, Week TiZ, season splits, and
 * workout authoring all share one zone count.
 *
 * ECO (`@/lib/eco`) is a deliberately separate 8-zone physiological model with its
 * own published cutoffs and score weights; it is not derived from these.
 */

export const ZONE_COUNT = 5;

export const ZONES = [1, 2, 3, 4, 5] as const;

export type ZoneNumber = (typeof ZONES)[number];

/** Cutoffs sit between zones, so there is always one fewer than there are zones. */
export const ZONE_CUTOFF_COUNT = ZONE_COUNT - 1;

export function isZoneNumber(value: number): value is ZoneNumber {
  return Number.isInteger(value) && value >= 1 && value <= ZONE_COUNT;
}

/**
 * Workouts were once authored with up to seven zones. Stored documents may still
 * hold those indices, so code that has to decide whether a number *is* a zone
 * index — rather than absolute watts, bpm, or pace seconds — recognises the wider
 * range and clamps the result. Nothing may author above {@link ZONE_COUNT}.
 */
export const LEGACY_MAX_AUTHORED_ZONE = 7;

export function isAuthoredZoneIndex(value: number): boolean {
  return (
    Number.isInteger(value) && value >= 1 && value <= LEGACY_MAX_AUTHORED_ZONE
  );
}

/**
 * Coerce any zone-ish number into the canonical range.
 *
 * Activities scored before the zone count was unified can hold zone 6/7 rows, and
 * boundary arrays longer than {@link ZONE_CUTOFF_COUNT} still produce them, so
 * reads of stored data route through here rather than dropping the minutes.
 */
export function clampZone(value: number): ZoneNumber {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 1) return 1;
  return Math.min(rounded, ZONE_COUNT) as ZoneNumber;
}

export function emptyZoneRecord<T>(fill: T): Record<ZoneNumber, T> {
  return { 1: fill, 2: fill, 3: fill, 4: fill, 5: fill };
}

/** Stacked-bar fill per zone, used by the TiZ charts and week summaries. */
export const ZONE_BAR_COLORS: Record<ZoneNumber, string> = {
  1: "bg-sky-200 dark:bg-sky-900",
  2: "bg-sky-400 dark:bg-sky-700",
  3: "bg-amber-400 dark:bg-amber-700",
  4: "bg-orange-500 dark:bg-orange-700",
  5: "bg-red-500 dark:bg-red-700",
};

export function zoneBarColor(zone: number): string {
  return ZONE_BAR_COLORS[clampZone(zone)];
}

/** Tinted pill treatment for the planner's editable zone inputs. */
export const ZONE_PILL_COLORS: Record<
  ZoneNumber,
  { pill: string; dot: string; input: string }
> = {
  1: {
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    dot: "bg-sky-500",
    input: "placeholder:text-sky-400/70 dark:placeholder:text-sky-300/50",
  },
  2: {
    pill: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    dot: "bg-green-500",
    input: "placeholder:text-green-400/70 dark:placeholder:text-green-300/50",
  },
  3: {
    pill: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
    dot: "bg-yellow-500",
    input: "placeholder:text-yellow-600/70 dark:placeholder:text-yellow-300/50",
  },
  4: {
    pill: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    dot: "bg-orange-500",
    input: "placeholder:text-orange-400/70 dark:placeholder:text-orange-300/50",
  },
  5: {
    pill: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    dot: "bg-red-500",
    input: "placeholder:text-red-400/70 dark:placeholder:text-red-300/50",
  },
};

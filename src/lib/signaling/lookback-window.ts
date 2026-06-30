export const LOOKBACK_WINDOW_HOURS_OPTIONS = [24, 48, 72] as const;

export type LookbackWindowHours = (typeof LOOKBACK_WINDOW_HOURS_OPTIONS)[number];

export const DEFAULT_LOOKBACK_WINDOW_HOURS: LookbackWindowHours = 72;

export const LOOKBACK_WINDOW_LABELS: Record<LookbackWindowHours, string> = {
  24: "24 hours",
  48: "48 hours",
  72: "72 hours",
};

export function isLookbackWindowHours(value: number): value is LookbackWindowHours {
  return (LOOKBACK_WINDOW_HOURS_OPTIONS as readonly number[]).includes(value);
}

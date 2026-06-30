export type InsightSensitivity =
  | "standard"
  | "sensitive"
  | "exploratory"
  | "debug";

export type InsightSensitivityConfig = {
  label: string;
  description: string;
  minGood: number;
  minBad: number;
  /** Min gap between bad-workout and good-workout overextension rates. */
  rateDelta: number;
  /** Min prior same-discipline workouts before a load window counts. */
  historyMin: number;
  /** Percentile rank at or above = overextended load. */
  overextendedPct: number;
};

export const INSIGHT_SENSITIVITY: Record<
  InsightSensitivity,
  InsightSensitivityConfig
> = {
  standard: {
    label: "Standard",
    description: "Stronger patterns only (25%+ gap).",
    minGood: 3,
    minBad: 3,
    rateDelta: 0.25,
    historyMin: 10,
    overextendedPct: 80,
  },
  sensitive: {
    label: "Sensitive",
    description: "Moderate patterns (12%+ gap). Good for mixed Garmin flags.",
    minGood: 3,
    minBad: 3,
    rateDelta: 0.12,
    historyMin: 8,
    overextendedPct: 75,
  },
  exploratory: {
    label: "Exploratory",
    description: "Weaker patterns (5%+ gap). More insights, less certainty.",
    minGood: 2,
    minBad: 2,
    rateDelta: 0.05,
    historyMin: 5,
    overextendedPct: 70,
  },
  debug: {
    label: "Debug",
    description: "Testing only (2%+ gap). Surfaces weak patterns — not for decisions.",
    minGood: 2,
    minBad: 2,
    rateDelta: 0.02,
    historyMin: 5,
    overextendedPct: 65,
  },
};

export const DEFAULT_INSIGHT_SENSITIVITY: InsightSensitivity = "sensitive";

export function isInsightSensitivity(value: string): value is InsightSensitivity {
  return value in INSIGHT_SENSITIVITY;
}

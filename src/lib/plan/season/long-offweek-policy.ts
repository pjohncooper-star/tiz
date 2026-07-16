import type { LongOffWeekPolicy } from "@prisma/client";

export type { LongOffWeekPolicy };

export const LONG_OFF_WEEK_POLICIES: LongOffWeekPolicy[] = [
  "NONE",
  "EXTRA_INTENSITY",
  "ENDURANCE_PERCENT",
];

export const LONG_OFF_WEEK_POLICY_LABELS: Record<LongOffWeekPolicy, string> = {
  NONE: "No substitute",
  EXTRA_INTENSITY: "Extra intensity day",
  ENDURANCE_PERCENT: "Endurance at % of long volume",
};

export type LongOffWeekResult =
  | { kind: "none" }
  | { kind: "extra_intensity" }
  | { kind: "substitute_endurance"; durationMinutes: number };

export function applyLongOffWeekPolicy(input: {
  policy: LongOffWeekPolicy;
  fullLongMinutes: number;
  endurancePercent: number;
}): LongOffWeekResult {
  const { policy, fullLongMinutes, endurancePercent } = input;
  if (policy === "NONE") {
    return { kind: "none" };
  }
  if (policy === "EXTRA_INTENSITY") {
    return { kind: "extra_intensity" };
  }
  const pct = Math.max(0, Math.min(100, endurancePercent));
  return {
    kind: "substitute_endurance",
    durationMinutes: Math.round(fullLongMinutes * (pct / 100)),
  };
}

export function shouldSuppressLongForWeek(input: {
  isRestWeek: boolean;
  isTaperPhase: boolean;
  isDeLoadWeek: boolean;
}): boolean {
  if (input.isRestWeek || input.isTaperPhase) return true;
  return false;
}

import type { PlanningMode } from "@prisma/client";

export type { PlanningMode };

export const PLANNING_MODES: PlanningMode[] = [
  "OVERALL",
  "BY_DISCIPLINE",
  "SEPARATE_LONGS",
  "SEPARATE_LONG_TIZ",
];

export const PLANNING_MODE_LABELS: Record<PlanningMode, string> = {
  OVERALL: "Overall volume & TiZ",
  BY_DISCIPLINE: "By discipline",
  SEPARATE_LONGS: "Separate long workouts",
  SEPARATE_LONG_TIZ: "Separate long TiZ",
};

export function planningModeIncludesLongs(mode: PlanningMode): boolean {
  return mode === "SEPARATE_LONGS" || mode === "SEPARATE_LONG_TIZ";
}

export function planningModeIncludesLongTiz(mode: PlanningMode): boolean {
  return mode === "SEPARATE_LONG_TIZ";
}

export type PhasePlanningSpan = {
  startWeekIndex: number;
  endWeekIndex: number;
  planningMode: PlanningMode | null;
  phaseKind: string;
};

export function resolvePlanningModeForWeek(
  weekIndex: number,
  phases: PhasePlanningSpan[],
  seasonDefault: PlanningMode
): PlanningMode {
  const sorted = [...phases]
    .filter((p) => p.startWeekIndex >= 0 && p.endWeekIndex >= p.startWeekIndex)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex);

  const phase = sorted.find(
    (p) => weekIndex >= p.startWeekIndex && weekIndex <= p.endWeekIndex
  );
  return phase?.planningMode ?? seasonDefault;
}

export function phaseForWeekIndex(
  weekIndex: number,
  phases: Array<{ startWeekIndex: number; endWeekIndex: number }>
): { startWeekIndex: number; endWeekIndex: number } | null {
  return (
    phases.find(
      (p) =>
        p.startWeekIndex >= 0 &&
        weekIndex >= p.startWeekIndex &&
        weekIndex <= p.endWeekIndex
    ) ?? null
  );
}

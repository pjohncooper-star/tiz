import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";

export function isAssignedPhase(phase: SimplePhase): boolean {
  return phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex;
}

export function isEmptyPhase(phase: SimplePhase): boolean {
  return !isAssignedPhase(phase);
}

export function phaseCoversWeek(phase: SimplePhase, weekIndex: number): boolean {
  return (
    isAssignedPhase(phase) &&
    weekIndex >= phase.startWeekIndex &&
    weekIndex <= phase.endWeekIndex
  );
}

export function phaseForWeekIndex(phases: SimplePhase[], weekIndex: number): SimplePhase | null {
  return phases.find((phase) => phaseCoversWeek(phase, weekIndex)) ?? null;
}

export function weekIsAssigned(phases: SimplePhase[], weekIndex: number): boolean {
  return phaseForWeekIndex(phases, weekIndex) !== null;
}

export function formatWeekLabel(weekIndex: number): string {
  return `Wk ${weekIndex + 1}`;
}

export function formatWeekRange(startWeekIndex: number, endWeekIndex: number): string {
  if (startWeekIndex === endWeekIndex) return formatWeekLabel(startWeekIndex);
  return `Wk ${startWeekIndex + 1}–${endWeekIndex + 1}`;
}

export function formatUnassignedWeeks(totalWeeks: number, phases: SimplePhase[]): string {
  const ranges = unassignedWeekRanges(totalWeeks, phases);
  if (ranges.length === 0) return "None";
  return ranges.map((range) => formatWeekRange(range.start, range.end)).join(", ");
}

export function unassignedWeekRanges(
  totalWeeks: number,
  phases: SimplePhase[]
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let rangeStart: number | null = null;

  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
    const assigned = weekIsAssigned(phases, weekIndex);
    if (!assigned) {
      if (rangeStart === null) rangeStart = weekIndex;
    } else if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: weekIndex - 1 });
      rangeStart = null;
    }
  }

  if (rangeStart !== null) {
    ranges.push({ start: rangeStart, end: totalWeeks - 1 });
  }

  return ranges;
}

export function sortedAssignedPhases(phases: SimplePhase[]): SimplePhase[] {
  return [...phases]
    .filter(isAssignedPhase)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex);
}

export function clampPhaseResize(
  phase: SimplePhase,
  phases: SimplePhase[],
  totalWeeks: number,
  nextStart: number,
  nextEnd: number
): { startWeekIndex: number; endWeekIndex: number } {
  const others = sortedAssignedPhases(phases).filter(
    (item) => (item.id ?? item.name) !== (phase.id ?? phase.name)
  );

  let start = Math.max(0, Math.min(nextStart, totalWeeks - 1));
  let end = Math.max(0, Math.min(nextEnd, totalWeeks - 1));
  if (start > end) [start, end] = [end, start];

  for (const other of others) {
    if (other.endWeekIndex < start) {
      start = Math.max(start, other.endWeekIndex + 1);
    }
    if (other.startWeekIndex > end) {
      end = Math.min(end, other.startWeekIndex - 1);
    }
    if (other.startWeekIndex > start && other.startWeekIndex <= end) {
      end = Math.min(end, other.startWeekIndex - 1);
    }
    if (other.endWeekIndex < end && other.endWeekIndex >= start) {
      start = Math.max(start, other.endWeekIndex + 1);
    }
  }

  if (start > end) {
    return { startWeekIndex: phase.startWeekIndex, endWeekIndex: phase.endWeekIndex };
  }

  return { startWeekIndex: start, endWeekIndex: end };
}

export function resizePhaseTop(
  phase: SimplePhase,
  phases: SimplePhase[],
  totalWeeks: number,
  newStart: number
): SimplePhase {
  const { startWeekIndex } = clampPhaseResize(
    phase,
    phases,
    totalWeeks,
    newStart,
    phase.endWeekIndex
  );
  return { ...phase, startWeekIndex };
}

export function resizePhaseBottom(
  phase: SimplePhase,
  phases: SimplePhase[],
  totalWeeks: number,
  newEnd: number
): SimplePhase {
  const { endWeekIndex } = clampPhaseResize(
    phase,
    phases,
    totalWeeks,
    phase.startWeekIndex,
    newEnd
  );
  return { ...phase, endWeekIndex };
}

export function setPhaseWeekRange(
  phase: SimplePhase,
  phases: SimplePhase[],
  totalWeeks: number,
  startWeekIndex: number,
  endWeekIndex: number
): SimplePhase {
  const clamped = clampPhaseResize(phase, phases, totalWeeks, startWeekIndex, endWeekIndex);
  return { ...phase, ...clamped };
}

export type GutterSegment =
  | { kind: "band"; phase: SimplePhase; rowCount: number }
  | { kind: "unassigned"; weekIndex: number; rowCount: number };

/** Clamp or unassign phases when season length changes. */
export function fitSimplePhasesToTotalWeeks(
  phases: SimplePhase[],
  totalWeeks: number
): SimplePhase[] {
  const maxIndex = Math.max(totalWeeks - 1, 0);
  return phases.map((phase) => {
    if (!isAssignedPhase(phase)) return phase;
    if (phase.startWeekIndex > maxIndex) {
      return { ...phase, startWeekIndex: -1, endWeekIndex: -1 };
    }
    const endWeekIndex = Math.min(phase.endWeekIndex, maxIndex);
    if (endWeekIndex < phase.startWeekIndex) {
      return { ...phase, startWeekIndex: -1, endWeekIndex: -1 };
    }
    return { ...phase, endWeekIndex };
  });
}

export function buildGutterSegments(weeks: { weekIndex: number }[], phases: SimplePhase[]): GutterSegment[] {
  const segments: GutterSegment[] = [];
  let index = 0;

  while (index < weeks.length) {
    const week = weeks[index]!;
    const phase = phaseForWeekIndex(phases, week.weekIndex);

    if (!phase) {
      segments.push({ kind: "unassigned", weekIndex: week.weekIndex, rowCount: 1 });
      index += 1;
      continue;
    }

    const group: typeof weeks = [];
    while (index < weeks.length) {
      const current = weeks[index]!;
      const currentPhase = phaseForWeekIndex(phases, current.weekIndex);
      if ((currentPhase?.id ?? currentPhase?.name) !== (phase.id ?? phase.name)) break;
      group.push(current);
      index += 1;
    }

    segments.push({ kind: "band", phase, rowCount: group.length });
  }

  return segments;
}

export function newPhaseId(): string {
  return `phase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

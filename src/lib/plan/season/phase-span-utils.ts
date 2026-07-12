import {
  createPhaseAtWeek,
  suggestSimplePhasesForWeeks,
  type SimplePhase,
} from "@/components/simple-planner/simple-planner-types";

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

export function sortedAssignedPhases(phases: SimplePhase[]): SimplePhase[] {
  return [...phases]
    .filter(isAssignedPhase)
    .sort((a, b) => a.startWeekIndex - b.startWeekIndex);
}

function phaseKey(phase: SimplePhase): string {
  return phase.id ?? phase.name;
}

function weekCountsFromPhases(phases: SimplePhase[]): number[] {
  return sortedAssignedPhases(phases).map(
    (phase) => phase.endWeekIndex - phase.startWeekIndex + 1
  );
}

function phasesFromWeekCounts(
  templates: SimplePhase[],
  weekCounts: number[]
): SimplePhase[] {
  let cursor = 0;
  return weekCounts.map((weekCount, index) => {
    const template = templates[index] ?? templates[templates.length - 1]!;
    const startWeekIndex = cursor;
    const endWeekIndex = cursor + weekCount - 1;
    cursor = endWeekIndex + 1;
    return {
      ...template,
      startWeekIndex,
      endWeekIndex,
    };
  });
}

function trimWeekCountsFromStart(weekCounts: number[], targetWeeks: number): number[] {
  let excess = weekCounts.reduce((sum, weeks) => sum + weeks, 0) - targetWeeks;
  const trimmed = [...weekCounts];

  while (excess > 0 && trimmed.length > 0) {
    const first = trimmed[0]!;
    if (first > excess) {
      trimmed[0] = first - excess;
      excess = 0;
    } else {
      excess -= first;
      trimmed.shift();
    }
  }

  return trimmed.length > 0 ? trimmed : [Math.max(targetWeeks, 1)];
}

function extendFirstWeekCount(weekCounts: number[], extraWeeks: number): number[] {
  if (weekCounts.length === 0) return [extraWeeks];
  const next = [...weekCounts];
  next[0] = (next[0] ?? 0) + extraWeeks;
  return next;
}

function resizeWeekCountsToTotal(weekCounts: number[], totalWeeks: number): number[] {
  const weeks = Math.max(totalWeeks, 1);
  const current = weekCounts.reduce((sum, count) => sum + count, 0);
  if (current === weeks) return weekCounts;
  if (weekCounts.length === 0) return [weeks];
  if (current > weeks) return trimWeekCountsFromStart(weekCounts, weeks);
  return extendFirstWeekCount(weekCounts, weeks - current);
}

/** Tile phases across the full season span with no gaps or overlaps. */
export function normalizePhasesToFullCoverage(
  phases: SimplePhase[],
  totalWeeks: number
): SimplePhase[] {
  const weeks = Math.max(totalWeeks, 0);
  if (weeks === 0) return [];

  const assigned = sortedAssignedPhases(phases);
  if (assigned.length === 0) {
    return suggestSimplePhasesForWeeks(weeks);
  }

  const weekCounts = resizeWeekCountsToTotal(weekCountsFromPhases(assigned), weeks);
  const templates =
    assigned.length >= weekCounts.length
      ? assigned.slice(0, weekCounts.length)
      : [
          ...assigned,
          ...Array.from({ length: weekCounts.length - assigned.length }, (_, index) =>
            createPhaseAtWeek(0, assigned.length + index + 1)
          ),
        ];

  return phasesFromWeekCounts(templates, weekCounts);
}

export function hasFullPhaseCoverage(phases: SimplePhase[], totalWeeks: number): boolean {
  if (totalWeeks <= 0) return phases.length === 0;
  const normalized = normalizePhasesToFullCoverage(phases, totalWeeks);
  if (normalized.length === 0) return false;
  if (normalized[0]!.startWeekIndex !== 0) return false;
  if (normalized[normalized.length - 1]!.endWeekIndex !== totalWeeks - 1) return false;
  for (let index = 1; index < normalized.length; index++) {
    const previous = normalized[index - 1]!;
    const current = normalized[index]!;
    if (current.startWeekIndex !== previous.endWeekIndex + 1) return false;
  }
  return sortedAssignedPhases(phases).length === normalized.length;
}

/** Adjust phase week counts when season length changes while keeping full coverage. */
export function fitSimplePhasesToTotalWeeks(
  phases: SimplePhase[],
  totalWeeks: number
): SimplePhase[] {
  return normalizePhasesToFullCoverage(phases, totalWeeks);
}

export function resizePhaseTopBoundary(
  phases: SimplePhase[],
  phaseId: string,
  totalWeeks: number,
  newStart: number
): SimplePhase[] {
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  const index = covered.findIndex((phase) => phaseKey(phase) === phaseId);
  if (index <= 0) return covered;

  const phase = covered[index]!;
  const previous = covered[index - 1]!;
  if (newStart >= phase.endWeekIndex) return covered;

  const clampedStart = Math.max(
    previous.startWeekIndex + 1,
    Math.min(newStart, phase.endWeekIndex)
  );

  return covered.map((item, itemIndex) => {
    if (itemIndex === index - 1) {
      return { ...item, endWeekIndex: clampedStart - 1 };
    }
    if (itemIndex === index) {
      return { ...item, startWeekIndex: clampedStart };
    }
    return item;
  });
}

export function resizePhaseBottomBoundary(
  phases: SimplePhase[],
  phaseId: string,
  totalWeeks: number,
  newEnd: number
): SimplePhase[] {
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  const index = covered.findIndex((phase) => phaseKey(phase) === phaseId);
  if (index < 0 || index >= covered.length - 1) return covered;

  const phase = covered[index]!;
  const next = covered[index + 1]!;
  const clampedEnd = Math.max(
    phase.startWeekIndex,
    Math.min(newEnd, next.endWeekIndex - 1)
  );

  return covered.map((item, itemIndex) => {
    if (itemIndex === index) {
      return { ...item, endWeekIndex: clampedEnd };
    }
    if (itemIndex === index + 1) {
      return { ...item, startWeekIndex: clampedEnd + 1 };
    }
    return item;
  });
}

export function resizePhaseTop(
  phase: SimplePhase,
  phases: SimplePhase[],
  totalWeeks: number,
  newStart: number
): SimplePhase {
  const phaseId = phaseKey(phase);
  const updated = resizePhaseTopBoundary(phases, phaseId, totalWeeks, newStart);
  return updated.find((item) => phaseKey(item) === phaseId) ?? phase;
}

export function resizePhaseBottom(
  phase: SimplePhase,
  phases: SimplePhase[],
  totalWeeks: number,
  newEnd: number
): SimplePhase {
  const phaseId = phaseKey(phase);
  const updated = resizePhaseBottomBoundary(phases, phaseId, totalWeeks, newEnd);
  return updated.find((item) => phaseKey(item) === phaseId) ?? phase;
}

export function applyPhaseBoundaryResize(
  phases: SimplePhase[],
  phaseId: string,
  edge: "top" | "bottom",
  totalWeeks: number,
  weekIndex: number
): SimplePhase[] {
  return edge === "top"
    ? resizePhaseTopBoundary(phases, phaseId, totalWeeks, weekIndex)
    : resizePhaseBottomBoundary(phases, phaseId, totalWeeks, weekIndex);
}

export function setPhaseWeekRange(
  phase: SimplePhase,
  phases: SimplePhase[],
  totalWeeks: number,
  startWeekIndex: number,
  endWeekIndex: number
): SimplePhase {
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  const index = covered.findIndex((item) => phaseKey(item) === phaseKey(phase));
  if (index < 0) return phase;

  let next = covered;
  if (startWeekIndex > phase.startWeekIndex && index > 0) {
    next = resizePhaseTopBoundary(next, phaseKey(phase), totalWeeks, startWeekIndex);
  }
  if (endWeekIndex < phase.endWeekIndex && index < covered.length - 1) {
    next = resizePhaseBottomBoundary(next, phaseKey(phase), totalWeeks, endWeekIndex);
  }

  return next.find((item) => phaseKey(item) === phaseKey(phase)) ?? phase;
}

/** Split the longest splittable phase to add another phase within the season span. */
export function splitLongestPhase(phases: SimplePhase[], totalWeeks: number): SimplePhase[] {
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  const splittable = covered.filter(
    (phase) => phase.endWeekIndex - phase.startWeekIndex >= 1
  );
  if (splittable.length === 0) return covered;

  const target = splittable.reduce((longest, phase) => {
    const longestWeeks = longest.endWeekIndex - longest.startWeekIndex;
    const phaseWeeks = phase.endWeekIndex - phase.startWeekIndex;
    return phaseWeeks > longestWeeks ? phase : longest;
  });

  const splitAt = Math.floor((target.startWeekIndex + target.endWeekIndex) / 2) + 1;
  return splitPhaseAtWeek(covered, splitAt, totalWeeks);
}

/** Split the phase containing `weekIndex` so the new phase starts that week. */
export function splitPhaseAtWeek(
  phases: SimplePhase[],
  weekIndex: number,
  totalWeeks: number
): SimplePhase[] {
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  const phase = phaseForWeekIndex(covered, weekIndex);
  if (!phase) return covered;
  if (weekIndex <= phase.startWeekIndex || weekIndex > phase.endWeekIndex) return covered;
  if (weekIndex === phase.startWeekIndex && phase.startWeekIndex === phase.endWeekIndex) {
    return covered;
  }

  const newPhase = createPhaseAtWeek(weekIndex, covered.length + 1);
  return covered.flatMap((item) => {
    if (phaseKey(item) !== phaseKey(phase)) return [item];
    return [
      { ...item, endWeekIndex: weekIndex - 1 },
      { ...newPhase, endWeekIndex: item.endWeekIndex },
    ];
  });
}

/** Remove a phase by merging its weeks into an adjacent phase. */
export function deletePhaseWithMerge(
  phases: SimplePhase[],
  phaseId: string,
  totalWeeks: number
): SimplePhase[] {
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  if (covered.length <= 1) return covered;

  const index = covered.findIndex((phase) => phaseKey(phase) === phaseId);
  if (index < 0) return covered;

  const mergeIntoIndex = index === covered.length - 1 ? index - 1 : index + 1;
  const removed = covered[index]!;
  const mergeTarget = covered[mergeIntoIndex]!;

  const merged =
    mergeIntoIndex < index
      ? {
          ...mergeTarget,
          endWeekIndex: removed.endWeekIndex,
        }
      : {
          ...mergeTarget,
          startWeekIndex: removed.startWeekIndex,
        };

  const withoutRemoved = covered.filter((phase) => phaseKey(phase) !== phaseId);
  return withoutRemoved.map((phase) =>
    phaseKey(phase) === phaseKey(mergeTarget) ? merged : phase
  );
}

export type GutterSegment = { kind: "band"; phase: SimplePhase; rowCount: number };

export function buildGutterSegments(
  weeks: { weekIndex: number }[],
  phases: SimplePhase[]
): GutterSegment[] {
  const totalWeeks = weeks.length;
  const covered = normalizePhasesToFullCoverage(phases, totalWeeks);
  const segments: GutterSegment[] = [];
  let index = 0;

  while (index < weeks.length) {
    const week = weeks[index]!;
    const phase = phaseForWeekIndex(covered, week.weekIndex);
    if (!phase) {
      index += 1;
      continue;
    }

    const group: typeof weeks = [];
    while (index < weeks.length) {
      const current = weeks[index]!;
      const currentPhase = phaseForWeekIndex(covered, current.weekIndex);
      if (!currentPhase || phaseKey(currentPhase) !== phaseKey(phase)) break;
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

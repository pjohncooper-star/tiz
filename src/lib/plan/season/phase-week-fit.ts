import {
  phaseWeekTotal,
  suggestPhasesForWeeks,
} from "@/lib/plan/season/default-phases";
import { defaultMesocycleDrafts } from "@/lib/plan/season/mesocycle-draft";
import type { SeasonPhaseInput } from "@/lib/plan/season/types";

function remesocyclePhase(
  phase: SeasonPhaseInput,
  mesocycleLengthWeeks: number
): SeasonPhaseInput {
  return {
    ...phase,
    mesocycles: defaultMesocycleDrafts(
      phase.name,
      phase.weekCount,
      mesocycleLengthWeeks
    ),
  };
}

function trimPhasesFromStart(
  phases: SeasonPhaseInput[],
  targetWeeks: number
): SeasonPhaseInput[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  let excess = phaseWeekTotal(sorted) - targetWeeks;
  const trimmed: SeasonPhaseInput[] = [...sorted];

  while (excess > 0 && trimmed.length > 0) {
    const first = trimmed[0]!;
    if (first.weekCount > excess) {
      trimmed[0] = { ...first, weekCount: first.weekCount - excess };
      excess = 0;
    } else {
      excess -= first.weekCount;
      trimmed.shift();
    }
  }

  return trimmed.map((phase, index) => ({ ...phase, sortOrder: index }));
}

function extendFirstPhase(
  phases: SeasonPhaseInput[],
  extraWeeks: number
): SeasonPhaseInput[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorted.length === 0) {
    return suggestPhasesForWeeks(extraWeeks);
  }
  const first = sorted[0]!;
  sorted[0] = { ...first, weekCount: first.weekCount + extraWeeks };
  return sorted;
}

/**
 * Adjust macro phase week counts to match a new season length.
 * Shortens by trimming leading phases (base first); lengthens by extending the first phase.
 */
export function fitPhasesToTotalWeeks(
  phases: SeasonPhaseInput[],
  targetWeeks: number,
  mesocycleLengthWeeks: number
): SeasonPhaseInput[] {
  const weeks = Math.max(targetWeeks, 1);
  const current = phaseWeekTotal(phases);

  if (current === weeks) {
    return [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  let fitted: SeasonPhaseInput[];
  if (phases.length === 0) {
    fitted = suggestPhasesForWeeks(weeks);
  } else if (current > weeks) {
    fitted = trimPhasesFromStart(phases, weeks);
    if (fitted.length === 0) {
      fitted = suggestPhasesForWeeks(weeks);
    }
  } else {
    fitted = extendFirstPhase(phases, weeks - current);
  }

  if (phaseWeekTotal(fitted) !== weeks) {
    fitted = suggestPhasesForWeeks(weeks);
  }

  const previousById = new Map(
    phases.filter((p) => p.id).map((p) => [p.id!, p] as const)
  );

  return fitted.map((phase, index) => {
    const previous = phase.id ? previousById.get(phase.id) : undefined;
    const weekCountChanged = previous?.weekCount !== phase.weekCount;
    const next = { ...phase, sortOrder: index };
    if (!previous || weekCountChanged || !next.mesocycles?.length) {
      return remesocyclePhase(next, mesocycleLengthWeeks);
    }
    return next;
  });
}

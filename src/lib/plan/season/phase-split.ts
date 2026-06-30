import type { ComputedMesocycle, SeasonPhaseInput } from "./types";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

function mesocycleRoman(index: number): string {
  return ROMAN[index] ?? String(index + 1);
}

export function splitPhaseIntoMesocycles(
  phase: SeasonPhaseInput,
  phaseIndex: number,
  startWeekIndex: number,
  mesocycleLengthWeeks: number
): ComputedMesocycle[] {
  if (phase.weekCount <= 0) return [];

  const length = Math.max(1, mesocycleLengthWeeks);
  const blocks: ComputedMesocycle[] = [];
  let cursor = startWeekIndex;
  let remaining = phase.weekCount;
  let blockIndex = 0;

  while (remaining > 0) {
    const weeksInBlock = Math.min(length, remaining);
    const endWeekIndex = cursor + weeksInBlock - 1;
    blocks.push({
      phaseIndex,
      phaseId: phase.id,
      name: `${phase.name} ${mesocycleRoman(blockIndex)}`,
      index: blockIndex,
      startWeekIndex: cursor,
      endWeekIndex,
    });
    cursor = endWeekIndex + 1;
    remaining -= weeksInBlock;
    blockIndex += 1;
  }

  return blocks;
}

export function splitAllPhasesIntoMesocycles(
  phases: SeasonPhaseInput[],
  mesocycleLengthWeeks: number
): ComputedMesocycle[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const result: ComputedMesocycle[] = [];
  let weekCursor = 0;

  for (let phaseIndex = 0; phaseIndex < sorted.length; phaseIndex++) {
    const phase = sorted[phaseIndex]!;
    const blocks = splitPhaseIntoMesocycles(
      phase,
      phaseIndex,
      weekCursor,
      mesocycleLengthWeeks
    );
    result.push(...blocks);
    weekCursor += phase.weekCount;
  }

  return result;
}

export function buildMesocyclesFromExplicitDefinitions(
  phases: SeasonPhaseInput[]
): ComputedMesocycle[] | null {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const result: ComputedMesocycle[] = [];
  let weekCursor = 0;

  for (let phaseIndex = 0; phaseIndex < sorted.length; phaseIndex++) {
    const phase = sorted[phaseIndex]!;
    if (!phase.mesocycles?.length) return null;
    const mesoWeekSum = phase.mesocycles.reduce((sum, m) => sum + m.weekCount, 0);
    if (mesoWeekSum !== phase.weekCount) return null;

    for (let i = 0; i < phase.mesocycles.length; i++) {
      const meso = phase.mesocycles[i]!;
      const weeksInBlock = meso.weekCount;
      const endWeekIndex = weekCursor + weeksInBlock - 1;
      result.push({
        phaseIndex,
        phaseId: phase.id,
        name: meso.name,
        index: i,
        startWeekIndex: weekCursor,
        endWeekIndex,
      });
      weekCursor = endWeekIndex + 1;
    }
  }

  return result;
}

export function resolveMesocycles(
  phases: SeasonPhaseInput[],
  mesocycleLengthWeeks: number
): ComputedMesocycle[] {
  const explicit = buildMesocyclesFromExplicitDefinitions(phases);
  if (explicit) return explicit;
  return splitAllPhasesIntoMesocycles(phases, mesocycleLengthWeeks);
}

export function mesocycleForWeekIndex(
  mesocycles: ComputedMesocycle[],
  weekIndex: number
): ComputedMesocycle | undefined {
  return mesocycles.find(
    (m) => weekIndex >= m.startWeekIndex && weekIndex <= m.endWeekIndex
  );
}

import type { SeasonPhaseInput } from "./types";
import { splitPhaseIntoMesocycles } from "./phase-split";

export type PhaseBlockDraft = {
  id: string;
  phaseId: string;
  name: string;
  index: number;
  startWeekIndex: number;
  endWeekIndex: number;
};

export type PhaseWithBlocks = {
  phaseId: string;
  phaseName: string;
  startWeekIndex: number;
  endWeekIndex: number;
  weekCount: number;
  blocks: PhaseBlockDraft[];
};

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Materialize internal SeasonMesocycle blocks for each assigned phase.
 */
export function buildPhaseBlocks(input: {
  phases: Array<{
    id: string;
    name: string;
    startWeekIndex: number;
    endWeekIndex: number;
    phaseKind?: SeasonPhaseInput["phaseKind"];
  }>;
  mesocycleLengthWeeks: number;
}): PhaseWithBlocks[] {
  const blockLength = Math.max(1, input.mesocycleLengthWeeks);
  const result: PhaseWithBlocks[] = [];

  for (const phase of input.phases) {
    if (phase.startWeekIndex < 0 || phase.endWeekIndex < phase.startWeekIndex) {
      continue;
    }
    const weekCount = phase.endWeekIndex - phase.startWeekIndex + 1;
    const phaseInput: SeasonPhaseInput = {
      name: phase.name,
      sortOrder: 0,
      weekCount,
      phaseKind: phase.phaseKind ?? "BASE",
      focusMode: "PHASE",
      phaseFocus: "AEROBIC_BASE",
      swimSessionsPerWeek: 3,
      bikeSessionsPerWeek: 4,
      runSessionsPerWeek: 3,
      id: phase.id,
    };

    const computed = splitPhaseIntoMesocycles(
      phaseInput,
      0,
      phase.startWeekIndex,
      blockLength
    );

    result.push({
      phaseId: phase.id,
      phaseName: phase.name,
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      weekCount,
      blocks: computed.map((block) => ({
        id: cuid(),
        phaseId: phase.id,
        name: block.name,
        index: block.index,
        startWeekIndex: block.startWeekIndex,
        endWeekIndex: block.endWeekIndex,
      })),
    });
  }

  return result;
}

export function mesocycleIdForWeek(
  weekIndex: number,
  phasesWithBlocks: PhaseWithBlocks[]
): string | null {
  for (const phase of phasesWithBlocks) {
    for (const block of phase.blocks) {
      if (weekIndex >= block.startWeekIndex && weekIndex <= block.endWeekIndex) {
        return block.id;
      }
    }
  }
  return null;
}

export function blocksForPersistence(phasesWithBlocks: PhaseWithBlocks[]): PhaseBlockDraft[] {
  return phasesWithBlocks.flatMap((phase) => phase.blocks);
}

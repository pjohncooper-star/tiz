import type { PhaseKind } from "@prisma/client";

export type LongSessionRampInput = {
  weekIndex: number;
  phaseKindsByWeek: PhaseKind[];
  startMin: number;
  peakMin: number;
};

function lastNonTaperWeekIndex(phaseKindsByWeek: PhaseKind[]): number {
  for (let i = phaseKindsByWeek.length - 1; i >= 0; i--) {
    if (phaseKindsByWeek[i] !== "TAPER") {
      return i;
    }
  }
  return Math.max(0, phaseKindsByWeek.length - 1);
}

function rampProgress(weekIndex: number, peakWeekIndex: number): number {
  if (peakWeekIndex <= 0) return weekIndex === 0 ? 0 : 1;
  return Math.min(1, weekIndex / peakWeekIndex);
}

/**
 * Linear ramp from start to peak minutes, reaching peak at the last non-taper week.
 * Taper weeks hold peak (long sessions are reduced separately via volume curve).
 */
export function computeLongSessionMinutes(input: LongSessionRampInput): number {
  const { weekIndex, phaseKindsByWeek, startMin, peakMin } = input;
  const peakWeek = lastNonTaperWeekIndex(phaseKindsByWeek);
  const t = rampProgress(weekIndex, peakWeek);
  const minutes = startMin + (peakMin - startMin) * t;
  return Math.round(minutes);
}

export function computeLongSessionsForWeek(
  weekIndex: number,
  phaseKindsByWeek: PhaseKind[],
  longRide: { startMin: number; peakMin: number },
  longRun: { startMin: number; peakMin: number }
): { longRideMinutes: number; longRunMinutes: number } {
  const kind = phaseKindsByWeek[weekIndex];
  const taperScale = kind === "TAPER" ? 0.6 : 1;

  const longRideMinutes = Math.round(
    computeLongSessionMinutes({
      weekIndex,
      phaseKindsByWeek,
      startMin: longRide.startMin,
      peakMin: longRide.peakMin,
    }) * taperScale
  );
  const longRunMinutes = Math.round(
    computeLongSessionMinutes({
      weekIndex,
      phaseKindsByWeek,
      startMin: longRun.startMin,
      peakMin: longRun.peakMin,
    }) * taperScale
  );

  return { longRideMinutes, longRunMinutes };
}

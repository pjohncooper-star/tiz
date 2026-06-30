import { DEFAULT_DE_LOAD_COUNT_SCALE_PERCENT } from "./constants";

export type SessionCounts = {
  swimSessions: number;
  bikeSessions: number;
  runSessions: number;
};

export function baseSessionCounts(input: {
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
}): SessionCounts {
  return {
    swimSessions: Math.max(0, input.swimSessionsPerWeek),
    bikeSessions: Math.max(0, input.bikeSessionsPerWeek),
    runSessions: Math.max(0, input.runSessionsPerWeek),
  };
}

function scaleCount(count: number, scalePercent: number): number {
  if (count <= 0) return 0;
  return Math.max(1, Math.round((count * scalePercent) / 100));
}

export function applyDeLoadSessionScaling(
  counts: SessionCounts,
  input: {
    isDeLoadWeek: boolean;
    reduceCountsOnDeLoad: boolean;
    deLoadCountScalePercent?: number | null;
  }
): SessionCounts {
  if (!input.isDeLoadWeek || !input.reduceCountsOnDeLoad) {
    return counts;
  }
  const scale = input.deLoadCountScalePercent ?? DEFAULT_DE_LOAD_COUNT_SCALE_PERCENT;
  return {
    swimSessions: scaleCount(counts.swimSessions, scale),
    bikeSessions: scaleCount(counts.bikeSessions, scale),
    runSessions: scaleCount(counts.runSessions, scale),
  };
}

export function totalSessions(counts: SessionCounts): number {
  return counts.swimSessions + counts.bikeSessions + counts.runSessions;
}

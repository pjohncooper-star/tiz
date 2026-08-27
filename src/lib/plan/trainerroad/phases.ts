import type { PhaseKind } from "@prisma/client";
import { daysBetweenDateKeys, mondayWeekStartKey, nextWeekStartKey } from "@/lib/dates";
import { defaultPhaseForKind } from "@/lib/plan/season/default-phases";
import type { SeasonPhaseInput } from "@/lib/plan/season/types";

export type TrainerRoadPhaseMarker = {
  dateKey: string;
  summary: string;
  weekStartDate: string;
};

type PhaseMatch = {
  name: string;
  phaseKind: PhaseKind;
};

const PHASE_RULES: Array<{ pattern: RegExp; match: (raw: string) => PhaseMatch }> = [
  {
    pattern: /^base\s*(1|i)?$/i,
    match: (raw) => ({ name: normalizeBaseName(raw, "1"), phaseKind: "BASE" }),
  },
  {
    pattern: /^base\s*(2|ii)$/i,
    match: (raw) => ({ name: normalizeBaseName(raw, "2"), phaseKind: "BASE" }),
  },
  {
    pattern: /^base\s*(3|iii)$/i,
    match: (raw) => ({ name: normalizeBaseName(raw, "3"), phaseKind: "BASE" }),
  },
  {
    pattern: /^build$/i,
    match: () => ({ name: "Build", phaseKind: "BUILD" }),
  },
  {
    pattern: /^(specialty|speciality)$/i,
    match: () => ({ name: "Specialty", phaseKind: "RACE_PREP" }),
  },
  {
    pattern: /^(recovery\s+week|rest\s+week|rest)$/i,
    match: () => ({ name: "Rest Week", phaseKind: "TAPER" }),
  },
];

function normalizeBaseName(raw: string, fallback: string): string {
  const numbered = /^base\s*(.+)$/i.exec(raw.trim());
  if (!numbered || !numbered[1]) return `Base ${fallback}`;
  return `Base ${numbered[1]!.trim()}`;
}

export function matchTrainerRoadPhaseSummary(summary: string): PhaseMatch | null {
  const trimmed = summary.trim();
  if (!trimmed) return null;
  for (const rule of PHASE_RULES) {
    if (rule.pattern.test(trimmed)) return rule.match(trimmed);
  }
  return null;
}

export function isTrainerRoadPhaseMarker(summary: string): boolean {
  return matchTrainerRoadPhaseSummary(summary) != null;
}

function mondaySpanWeeks(startMonday: string, nextMonday: string): number {
  const days = daysBetweenDateKeys(startMonday, nextMonday);
  return Math.max(1, Math.round(days / 7));
}

function exclusiveEndMonday(inclusiveEndDateKey: string): string {
  return nextWeekStartKey(mondayWeekStartKey(inclusiveEndDateKey));
}

export type TrainerRoadPhaseSpan = {
  weekStartDate: string;
  name: string;
  phaseKind: PhaseKind;
  weekCount: number;
};

/**
 * Monday-aligned phase spans from TR annotations.
 * Duplicate labels (two "Base 1" blocks) stay as separate rows.
 */
export function trainerRoadMarkersToPhaseSpans(
  markers: TrainerRoadPhaseMarker[],
  options?: { lastWorkoutDateKey?: string; seasonEndDateKey?: string }
): TrainerRoadPhaseSpan[] {
  const mapped = markers
    .map((marker) => {
      const match = matchTrainerRoadPhaseSummary(marker.summary);
      if (!match) return null;
      return {
        weekStartDate: mondayWeekStartKey(marker.weekStartDate || marker.dateKey),
        name: match.name,
        phaseKind: match.phaseKind,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

  if (mapped.length === 0) return [];

  const inclusiveEnd = options?.seasonEndDateKey
    ? options.seasonEndDateKey
    : [options?.lastWorkoutDateKey, mapped[mapped.length - 1]!.weekStartDate]
        .filter((value): value is string => Boolean(value))
        .reduce((latest, key) => (key > latest ? key : latest));

  return mapped.map((row, index) => {
    const nextStart =
      mapped[index + 1]?.weekStartDate ?? exclusiveEndMonday(inclusiveEnd);
    return {
      weekStartDate: row.weekStartDate,
      name: row.name,
      phaseKind: row.phaseKind,
      weekCount: mondaySpanWeeks(row.weekStartDate, nextStart),
    };
  });
}

/**
 * Turn TR Monday phase markers into SeasonPhase drafts.
 * Duplicate labels (two "Base 1" blocks) stay as separate rows.
 */
export function trainerRoadMarkersToSeasonPhases(
  markers: TrainerRoadPhaseMarker[],
  options?: { lastWorkoutDateKey?: string; seasonEndDateKey?: string }
): SeasonPhaseInput[] {
  return trainerRoadMarkersToPhaseSpans(markers, options).map((row, index) =>
    defaultPhaseForKind(row.phaseKind, row.weekCount, index, row.name)
  );
}

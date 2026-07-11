import {
  DEFAULT_PHASE_INTENSE_DAYS,
  DEFAULT_PHASE_SESSIONS,
} from "@/components/simple-planner/simple-planner-types";
import {
  parsePhaseZoneSplits,
  serializePhaseZoneSplits,
} from "@/lib/plan/season/phase-zone-defaults";
import type { PhaseZoneSplits } from "@/lib/plan/season/zone-split-types";

type PhaseCoachNotesPayload = {
  goal?: string | null;
  strengthSessionsPerWeek?: number;
  swimIntenseDaysPerWeek?: number;
  bikeIntenseDaysPerWeek?: number;
  runIntenseDaysPerWeek?: number;
  zoneSplits?: unknown;
};

export type PhaseCoachNotes = {
  goal: string | null;
  strengthSessionsPerWeek: number;
  swimIntenseDaysPerWeek: number;
  bikeIntenseDaysPerWeek: number;
  runIntenseDaysPerWeek: number;
  zoneSplits: PhaseZoneSplits | null;
};

const DEFAULTS: Omit<PhaseCoachNotes, "goal"> = {
  strengthSessionsPerWeek: DEFAULT_PHASE_SESSIONS.strengthSessionsPerWeek,
  swimIntenseDaysPerWeek: DEFAULT_PHASE_INTENSE_DAYS.swimIntenseDaysPerWeek,
  bikeIntenseDaysPerWeek: DEFAULT_PHASE_INTENSE_DAYS.bikeIntenseDaysPerWeek,
  runIntenseDaysPerWeek: DEFAULT_PHASE_INTENSE_DAYS.runIntenseDaysPerWeek,
  zoneSplits: null,
};

function nonNegativeIntOr(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback;
}

export function parsePhaseCoachNotes(coachNotes: string | null): PhaseCoachNotes {
  if (!coachNotes?.trim()) {
    return { goal: null, ...DEFAULTS };
  }

  try {
    const parsed = JSON.parse(coachNotes) as PhaseCoachNotesPayload;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const known = [
        "strengthSessionsPerWeek",
        "swimIntenseDaysPerWeek",
        "bikeIntenseDaysPerWeek",
        "runIntenseDaysPerWeek",
        "goal",
        "zoneSplits",
      ] as const;
      if (known.some((key) => key in parsed)) {
        return {
          goal: typeof parsed.goal === "string" ? parsed.goal.trim() || null : null,
          zoneSplits: parsePhaseZoneSplits(parsed.zoneSplits),
          strengthSessionsPerWeek: nonNegativeIntOr(
            parsed.strengthSessionsPerWeek,
            DEFAULTS.strengthSessionsPerWeek
          ),
          swimIntenseDaysPerWeek: nonNegativeIntOr(
            parsed.swimIntenseDaysPerWeek,
            DEFAULTS.swimIntenseDaysPerWeek
          ),
          bikeIntenseDaysPerWeek: nonNegativeIntOr(
            parsed.bikeIntenseDaysPerWeek,
            DEFAULTS.bikeIntenseDaysPerWeek
          ),
          runIntenseDaysPerWeek: nonNegativeIntOr(
            parsed.runIntenseDaysPerWeek,
            DEFAULTS.runIntenseDaysPerWeek
          ),
        };
      }
    }
  } catch {
    // Plain-text coach notes from legacy/advanced planner.
  }

  return { goal: coachNotes.trim(), ...DEFAULTS };
}

export function serializePhaseCoachNotes(input: PhaseCoachNotes): string | null {
  const trimmedGoal = input.goal?.trim() || null;
  const data: Omit<PhaseCoachNotes, "goal" | "zoneSplits"> = {
    strengthSessionsPerWeek: Math.max(0, Math.round(input.strengthSessionsPerWeek)),
    swimIntenseDaysPerWeek: Math.max(0, Math.round(input.swimIntenseDaysPerWeek)),
    bikeIntenseDaysPerWeek: Math.max(0, Math.round(input.bikeIntenseDaysPerWeek)),
    runIntenseDaysPerWeek: Math.max(0, Math.round(input.runIntenseDaysPerWeek)),
  };

  const allDefault =
    data.strengthSessionsPerWeek === DEFAULTS.strengthSessionsPerWeek &&
    data.swimIntenseDaysPerWeek === DEFAULTS.swimIntenseDaysPerWeek &&
    data.bikeIntenseDaysPerWeek === DEFAULTS.bikeIntenseDaysPerWeek &&
    data.runIntenseDaysPerWeek === DEFAULTS.runIntenseDaysPerWeek &&
    !input.zoneSplits;

  if (allDefault) {
    return trimmedGoal;
  }

  return JSON.stringify({
    ...(trimmedGoal ? { goal: trimmedGoal } : {}),
    ...data,
    ...(input.zoneSplits ? { zoneSplits: serializePhaseZoneSplits(input.zoneSplits) } : {}),
  });
}

import { DEFAULT_PHASE_SESSIONS } from "@/components/simple-planner/simple-planner-types";

type PhaseCoachNotesPayload = {
  goal?: string | null;
  strengthSessionsPerWeek?: number;
};

export function parsePhaseCoachNotes(coachNotes: string | null): {
  goal: string | null;
  strengthSessionsPerWeek: number;
} {
  const defaultStrength = DEFAULT_PHASE_SESSIONS.strengthSessionsPerWeek;
  if (!coachNotes?.trim()) {
    return { goal: null, strengthSessionsPerWeek: defaultStrength };
  }

  try {
    const parsed = JSON.parse(coachNotes) as PhaseCoachNotesPayload;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if ("strengthSessionsPerWeek" in parsed || "goal" in parsed) {
        const strength = Number(parsed.strengthSessionsPerWeek);
        return {
          goal: typeof parsed.goal === "string" ? parsed.goal.trim() || null : null,
          strengthSessionsPerWeek:
            Number.isFinite(strength) && strength >= 0
              ? Math.round(strength)
              : defaultStrength,
        };
      }
    }
  } catch {
    // Plain-text coach notes from legacy/advanced planner.
  }

  return { goal: coachNotes.trim(), strengthSessionsPerWeek: defaultStrength };
}

export function serializePhaseCoachNotes(
  goal: string | null | undefined,
  strengthSessionsPerWeek: number
): string | null {
  const trimmedGoal = goal?.trim() || null;
  const strength = Math.max(0, Math.round(strengthSessionsPerWeek));
  const defaultStrength = DEFAULT_PHASE_SESSIONS.strengthSessionsPerWeek;

  if (strength === defaultStrength) {
    return trimmedGoal;
  }

  return JSON.stringify({
    ...(trimmedGoal ? { goal: trimmedGoal } : {}),
    strengthSessionsPerWeek: strength,
  });
}

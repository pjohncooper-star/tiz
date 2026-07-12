import {
  DEFAULT_PHASE_INTENSE_DAYS,
  DEFAULT_PHASE_SESSIONS,
} from "@/components/simple-planner/simple-planner-types";
import {
  resolvePhaseVolumeSettings,
  type LongSessionCadence,
  type PhaseVolumeSettings,
  type SimplePhaseVolumeTrend,
} from "@/lib/plan/season/phase-volume-settings";
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
  volumeTrend?: SimplePhaseVolumeTrend;
  isTaperVolume?: boolean;
  volumeTargetPercent?: number;
  volumeTaperStartPercent?: number;
  volumeTaperEndPercent?: number;
  longSessionCadence?: LongSessionCadence;
  suppressRecovery?: boolean;
  zoneSplits?: unknown;
};

export type PhaseCoachNotes = {
  goal: string | null;
  strengthSessionsPerWeek: number;
  swimIntenseDaysPerWeek: number;
  bikeIntenseDaysPerWeek: number;
  runIntenseDaysPerWeek: number;
  volumeTrend: SimplePhaseVolumeTrend | null;
  isTaperVolume: boolean;
  volumeTargetPercent: number | null;
  volumeTaperStartPercent: number | null;
  volumeTaperEndPercent: number | null;
  longSessionCadence: LongSessionCadence | null;
  suppressRecovery: boolean | null;
  zoneSplits: PhaseZoneSplits | null;
};

const DEFAULTS: Omit<PhaseCoachNotes, "goal"> = {
  strengthSessionsPerWeek: DEFAULT_PHASE_SESSIONS.strengthSessionsPerWeek,
  swimIntenseDaysPerWeek: DEFAULT_PHASE_INTENSE_DAYS.swimIntenseDaysPerWeek,
  bikeIntenseDaysPerWeek: DEFAULT_PHASE_INTENSE_DAYS.bikeIntenseDaysPerWeek,
  runIntenseDaysPerWeek: DEFAULT_PHASE_INTENSE_DAYS.runIntenseDaysPerWeek,
  volumeTrend: null,
  isTaperVolume: false,
  volumeTargetPercent: null,
  volumeTaperStartPercent: null,
  volumeTaperEndPercent: null,
  longSessionCadence: null,
  suppressRecovery: null,
  zoneSplits: null,
};

function nonNegativeIntOr(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback;
}

function percentOrNull(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(1, Math.min(150, Math.round(num)));
}

function parseLongSessionCadence(value: unknown): LongSessionCadence | null {
  if (value === "EVERY_WEEK" || value === "EVERY_OTHER" || value === "NONE") {
    return value;
  }
  return null;
}

function parseVolumeTrend(value: unknown): SimplePhaseVolumeTrend | null {
  if (value === "INCREASE" || value === "HOLD" || value === "DECREASE" || value === "TAPER") {
    return value;
  }
  return null;
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
        "volumeTrend",
        "isTaperVolume",
        "volumeTargetPercent",
        "volumeTaperStartPercent",
        "volumeTaperEndPercent",
        "longSessionCadence",
        "suppressRecovery",
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
          volumeTrend: parseVolumeTrend(parsed.volumeTrend),
          isTaperVolume: parsed.isTaperVolume === true,
          volumeTargetPercent: percentOrNull(parsed.volumeTargetPercent),
          volumeTaperStartPercent: percentOrNull(parsed.volumeTaperStartPercent),
          volumeTaperEndPercent: percentOrNull(parsed.volumeTaperEndPercent),
          longSessionCadence: parseLongSessionCadence(parsed.longSessionCadence),
          suppressRecovery:
            typeof parsed.suppressRecovery === "boolean" ? parsed.suppressRecovery : null,
        };
      }
    }
  } catch {
    // Plain-text coach notes from legacy/advanced planner.
  }

  return { goal: coachNotes.trim(), ...DEFAULTS };
}

export function phaseVolumeSettingsFromCoachNotes(
  notes: PhaseCoachNotes,
  input: { phaseKind?: import("@prisma/client").PhaseKind | null; name?: string | null } = {}
): PhaseVolumeSettings {
  return resolvePhaseVolumeSettings({
    volumeTrend: notes.volumeTrend ?? (notes.isTaperVolume ? "TAPER" : null),
    volumeTargetPercent: notes.volumeTargetPercent,
    volumeTaperStartPercent: notes.volumeTaperStartPercent,
    volumeTaperEndPercent: notes.volumeTaperEndPercent,
    longSessionCadence: notes.longSessionCadence,
    suppressRecovery: notes.suppressRecovery,
    phaseKind: input.phaseKind ?? null,
    name: input.name ?? null,
  });
}

export function serializePhaseCoachNotes(input: PhaseCoachNotes): string | null {
  const trimmedGoal = input.goal?.trim() || null;
  const data: Omit<PhaseCoachNotes, "goal" | "zoneSplits"> = {
    strengthSessionsPerWeek: Math.max(0, Math.round(input.strengthSessionsPerWeek)),
    swimIntenseDaysPerWeek: Math.max(0, Math.round(input.swimIntenseDaysPerWeek)),
    bikeIntenseDaysPerWeek: Math.max(0, Math.round(input.bikeIntenseDaysPerWeek)),
    runIntenseDaysPerWeek: Math.max(0, Math.round(input.runIntenseDaysPerWeek)),
    volumeTrend: input.volumeTrend,
    isTaperVolume: input.isTaperVolume,
    volumeTargetPercent: input.volumeTargetPercent,
    volumeTaperStartPercent: input.volumeTaperStartPercent,
    volumeTaperEndPercent: input.volumeTaperEndPercent,
    longSessionCadence: input.longSessionCadence,
    suppressRecovery: input.suppressRecovery,
  };

  const sessionDefaults =
    data.strengthSessionsPerWeek === DEFAULTS.strengthSessionsPerWeek &&
    data.swimIntenseDaysPerWeek === DEFAULTS.swimIntenseDaysPerWeek &&
    data.bikeIntenseDaysPerWeek === DEFAULTS.bikeIntenseDaysPerWeek &&
    data.runIntenseDaysPerWeek === DEFAULTS.runIntenseDaysPerWeek &&
    !input.zoneSplits;

  const volumeDefaults =
    data.volumeTrend == null &&
    !data.isTaperVolume &&
    data.volumeTargetPercent == null &&
    data.volumeTaperStartPercent == null &&
    data.volumeTaperEndPercent == null &&
    data.longSessionCadence == null &&
    data.suppressRecovery == null;

  if (sessionDefaults && volumeDefaults) {
    return trimmedGoal;
  }

  const payload: PhaseCoachNotesPayload = {
    ...(trimmedGoal ? { goal: trimmedGoal } : {}),
    ...(data.strengthSessionsPerWeek !== DEFAULTS.strengthSessionsPerWeek
      ? { strengthSessionsPerWeek: data.strengthSessionsPerWeek }
      : {}),
    ...(data.swimIntenseDaysPerWeek !== DEFAULTS.swimIntenseDaysPerWeek
      ? { swimIntenseDaysPerWeek: data.swimIntenseDaysPerWeek }
      : {}),
    ...(data.bikeIntenseDaysPerWeek !== DEFAULTS.bikeIntenseDaysPerWeek
      ? { bikeIntenseDaysPerWeek: data.bikeIntenseDaysPerWeek }
      : {}),
    ...(data.runIntenseDaysPerWeek !== DEFAULTS.runIntenseDaysPerWeek
      ? { runIntenseDaysPerWeek: data.runIntenseDaysPerWeek }
      : {}),
    ...(data.volumeTrend ? { volumeTrend: data.volumeTrend } : {}),
    ...(data.isTaperVolume ? { isTaperVolume: true } : {}),
    ...(data.volumeTargetPercent != null
      ? { volumeTargetPercent: data.volumeTargetPercent }
      : {}),
    ...(data.volumeTaperStartPercent != null
      ? { volumeTaperStartPercent: data.volumeTaperStartPercent }
      : {}),
    ...(data.volumeTaperEndPercent != null
      ? { volumeTaperEndPercent: data.volumeTaperEndPercent }
      : {}),
    ...(data.longSessionCadence ? { longSessionCadence: data.longSessionCadence } : {}),
    ...(data.suppressRecovery != null ? { suppressRecovery: data.suppressRecovery } : {}),
    ...(input.zoneSplits ? { zoneSplits: serializePhaseZoneSplits(input.zoneSplits) } : {}),
  };

  return JSON.stringify(payload);
}

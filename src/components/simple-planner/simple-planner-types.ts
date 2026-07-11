import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import type { ZoneRampDefaultsByDiscipline } from "@/lib/plan/season/simple-tiz";
import type { RecoverySettings } from "@/lib/plan/season/recovery";
import type {
  GoalEventDraft,
  UnlinkedRaceSession,
} from "@/components/season/season-settings-types";
import { suggestPhasesForWeeks } from "@/lib/plan/season/default-phases";
import {
  defaultVolumeSettingsForPhaseKind,
  type LongSessionCadence,
  type SimplePhaseVolumeTrend,
} from "@/lib/plan/season/phase-volume-settings";
import type { ZoneMinutes } from "@/lib/workout/steps";

export const PHASE_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#6366f1", "#ec4899", "#14b8a6"];

export const DEFAULT_PHASE_SESSIONS = {
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
  strengthSessionsPerWeek: 2,
} as const;

export const DEFAULT_PHASE_INTENSE_DAYS = {
  swimIntenseDaysPerWeek: 1,
  bikeIntenseDaysPerWeek: 1,
  runIntenseDaysPerWeek: 1,
} as const;

export const DEFAULT_PHASE_VOLUME_FIELDS = {
  volumeTrend: "INCREASE",
  volumeTargetPercent: 100,
  volumeTaperStartPercent: 70,
  volumeTaperEndPercent: 45,
  longSessionCadence: "EVERY_OTHER",
  suppressRecovery: false,
} as const satisfies Pick<
  SimplePhase,
  | "volumeTrend"
  | "volumeTargetPercent"
  | "volumeTaperStartPercent"
  | "volumeTaperEndPercent"
  | "longSessionCadence"
  | "suppressRecovery"
>;

export type SimpleGoalEvent = GoalEventDraft & {
  priority: "A" | "B" | "C";
};

export type SimplePhase = {
  id?: string;
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
  rampEnabled: {
    swim: boolean;
    bike: boolean;
    run: boolean;
  };
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
  strengthSessionsPerWeek: number;
  swimIntenseDaysPerWeek: number;
  bikeIntenseDaysPerWeek: number;
  runIntenseDaysPerWeek: number;
  goal: string | null;
  volumeTrend: SimplePhaseVolumeTrend;
  volumeTargetPercent: number;
  volumeTaperStartPercent: number;
  volumeTaperEndPercent: number;
  longSessionCadence: LongSessionCadence;
  suppressRecovery: boolean;
};

export type SimpleWeek = {
  weekIndex: number;
  weekStartDate: string;
  isRestWeek: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  totalHours: number;
  swimDistanceMeters?: number | null;
  runDistanceMeters?: number | null;
  zoneMinutes: ZoneMinutes;
  zoneMinutesOverridden?: boolean;
  volumeOverridden?: boolean;
};

export type SimpleSeason = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  status: string;
  rampDefaults: SimpleRampDefaults;
  zoneRampDefaults: ZoneRampDefaultsByDiscipline;
  recovery: RecoverySettings;
  unlinkedRaceSessions: UnlinkedRaceSession[];
  phases: SimplePhase[];
  weeks: SimpleWeek[];
  goalEvents: SimpleGoalEvent[];
  primaryGoalEvent: SimpleGoalEvent | null;
};

export function emptyRace(priority: "A" | "B" | "C"): SimpleGoalEvent {
  return {
    name: "",
    date: "",
    disciplines: priority === "A" ? ["SWIM", "BIKE", "RUN"] : ["RUN"],
    priority,
    distanceMeters: null,
    estimatedDurationMinutes: null,
    swimGoalMinutes: null,
    bikeGoalMinutes: null,
    runGoalMinutes: null,
    taperDaysBefore: null,
    notes: null,
  };
}

export function newPhaseId(): string {
  return `phase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultPhaseCoverage(totalWeeks: number): SimplePhase[] {
  if (totalWeeks <= 0) return [];
  return [
    {
      id: newPhaseId(),
      name: "Phase 1",
      color: PHASE_COLORS[0] ?? "#38bdf8",
      startWeekIndex: 0,
      endWeekIndex: totalWeeks - 1,
      rampEnabled: { swim: true, bike: true, run: true },
      ...DEFAULT_PHASE_SESSIONS,
      ...DEFAULT_PHASE_INTENSE_DAYS,
      goal: null,
      ...DEFAULT_PHASE_VOLUME_FIELDS,
    },
  ];
}

export function suggestSimplePhasesForWeeks(totalWeeks: number): SimplePhase[] {
  if (totalWeeks <= 0) return [];
  const suggested = suggestPhasesForWeeks(totalWeeks);
  let cursor = 0;
  return suggested.map((phase) => {
    const startWeekIndex = cursor;
    const endWeekIndex = cursor + phase.weekCount - 1;
    cursor = endWeekIndex + 1;
    const volume = defaultVolumeSettingsForPhaseKind(phase.phaseKind);
    return {
      id: newPhaseId(),
      name: phase.name,
      color: phase.color ?? PHASE_COLORS[0] ?? "#38bdf8",
      startWeekIndex,
      endWeekIndex,
      rampEnabled: { swim: true, bike: true, run: true },
      ...DEFAULT_PHASE_SESSIONS,
      ...DEFAULT_PHASE_INTENSE_DAYS,
      goal: null,
      volumeTrend: volume.volumeTrend,
      volumeTargetPercent: volume.volumeTargetPercent,
      volumeTaperStartPercent: volume.volumeTaperStartPercent,
      volumeTaperEndPercent: volume.volumeTaperEndPercent,
      longSessionCadence: volume.longSessionCadence,
      suppressRecovery: volume.suppressRecovery,
    };
  });
}

export function createPhaseAtWeek(weekIndex: number, index: number): SimplePhase {
  return {
    id: newPhaseId(),
    name: `Phase ${index}`,
    color: PHASE_COLORS[index % PHASE_COLORS.length] ?? "#38bdf8",
    startWeekIndex: weekIndex,
    endWeekIndex: weekIndex,
    rampEnabled: { swim: true, bike: true, run: true },
    ...DEFAULT_PHASE_SESSIONS,
    ...DEFAULT_PHASE_INTENSE_DAYS,
    goal: null,
    ...DEFAULT_PHASE_VOLUME_FIELDS,
  };
}


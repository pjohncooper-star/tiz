import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import type { ZoneRampDefaultsByDiscipline } from "@/lib/plan/season/simple-tiz";
import { newPhaseId } from "@/lib/plan/season/phase-span-utils";
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

export type SimpleGoalEvent = {
  id?: string;
  name: string;
  date: string;
  disciplines: ("SWIM" | "BIKE" | "RUN")[];
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
  };
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
  };
}

export function createEmptyPhase(index: number): SimplePhase {
  return {
    id: newPhaseId(),
    name: `Phase ${index}`,
    color: PHASE_COLORS[index % PHASE_COLORS.length] ?? "#38bdf8",
    startWeekIndex: -1,
    endWeekIndex: -1,
    rampEnabled: { swim: true, bike: true, run: true },
    ...DEFAULT_PHASE_SESSIONS,
    ...DEFAULT_PHASE_INTENSE_DAYS,
    goal: null,
  };
}

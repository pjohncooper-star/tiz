import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import { newPhaseId } from "@/lib/plan/season/phase-span-utils";

export const PHASE_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#6366f1", "#ec4899", "#14b8a6"];

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
};

export type SimpleSeason = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  status: string;
  rampDefaults: SimpleRampDefaults;
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
    goal: null,
  };
}

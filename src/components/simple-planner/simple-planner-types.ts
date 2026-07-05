import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";

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

export const PHASE_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#6366f1", "#ec4899", "#14b8a6"];

export function emptyRace(priority: "A" | "B" | "C"): SimpleGoalEvent {
  return {
    name: "",
    date: "",
    disciplines: priority === "A" ? ["SWIM", "BIKE", "RUN"] : ["RUN"],
    priority,
  };
}

export function defaultPhase(totalWeeks: number, index: number): SimplePhase {
  const span = Math.max(1, Math.floor(totalWeeks / 3));
  const startWeekIndex = Math.min(index * span, totalWeeks - 1);
  const endWeekIndex = Math.min(startWeekIndex + span - 1, totalWeeks - 1);
  return {
    name: `Phase ${index + 1}`,
    color: PHASE_COLORS[index % PHASE_COLORS.length] ?? "#38bdf8",
    startWeekIndex,
    endWeekIndex,
    rampEnabled: { swim: true, bike: true, run: true },
  };
}

export function phaseForWeek(phases: SimplePhase[], weekIndex: number): SimplePhase | null {
  return (
    phases.find(
      (phase) => weekIndex >= phase.startWeekIndex && weekIndex <= phase.endWeekIndex
    ) ?? null
  );
}

export type TableSegment = {
  phase: SimplePhase | null;
  weeks: SimpleWeek[];
};

export function buildTableSegments(weeks: SimpleWeek[], phases: SimplePhase[]): TableSegment[] {
  const segments: TableSegment[] = [];
  let index = 0;

  while (index < weeks.length) {
    const week = weeks[index]!;
    const phase = phaseForWeek(phases, week.weekIndex);
    const phaseKey = phase?.id ?? phase?.name ?? null;
    const group: SimpleWeek[] = [];

    while (index < weeks.length) {
      const current = weeks[index]!;
      const currentPhase = phaseForWeek(phases, current.weekIndex);
      const currentKey = currentPhase?.id ?? currentPhase?.name ?? null;
      if (currentKey !== phaseKey) break;
      group.push(current);
      index += 1;
    }

    segments.push({ phase, weeks: group });
  }

  return segments;
}

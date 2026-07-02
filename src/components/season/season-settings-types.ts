import {
  defaultMesocycleDrafts,
  mesocyclesFromSerialized,
  type MesocycleDraft,
} from "@/lib/plan/season/mesocycle-draft";
import {
  goalMinutesForDiscipline,
  hasPartialDisciplineGoalTimes,
} from "@/lib/plan/season/goal-event-times";

export type PhaseFocus =
  | "AEROBIC_BASE"
  | "THRESHOLD"
  | "VO2_MAX"
  | "RACE_SPECIFICITY"
  | "FRESHNESS"
  | "STRENGTH_POWER"
  | "MAINTENANCE";

export type PhaseKind = "BASE" | "BUILD" | "RACE_PREP" | "TAPER";

export type VolumeMesocycleMode = "INCREASE" | "HOLD" | "DECREASE";

export type Discipline = "SWIM" | "BIKE" | "RUN";

export type EventPriority = "A" | "B" | "C";

export type GoalEventDraft = {
  id?: string;
  plannedSessionId?: string;
  name: string;
  date: string;
  disciplines: Discipline[];
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
  taperDaysBefore?: number | null;
  notes?: string | null;
};

export type UnlinkedRaceSession = {
  plannedSessionId: string;
  name: string;
  date: string;
  disciplines: Discipline[];
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  multisportGroupId?: string | null;
  notes?: string | null;
};

export function emptyGoalEventDraft(disciplines: Discipline[] = ["RUN"]): GoalEventDraft {
  return {
    name: "",
    date: "",
    disciplines,
    distanceMeters: null,
    estimatedDurationMinutes: null,
    swimGoalMinutes: null,
    bikeGoalMinutes: null,
    runGoalMinutes: null,
    notes: null,
  };
}

export function isGoalEventComplete(race: GoalEventDraft): boolean {
  return Boolean(race.name.trim() && race.date && race.disciplines.length > 0);
}

export function isGoalEventPartial(race: GoalEventDraft): boolean {
  const hasAny = Boolean(
    race.name.trim() ||
      race.date ||
      race.disciplines.length > 0 ||
      race.distanceMeters != null ||
      race.estimatedDurationMinutes != null ||
      race.swimGoalMinutes != null ||
      race.bikeGoalMinutes != null ||
      race.runGoalMinutes != null ||
      (race.notes?.trim() ?? "")
  );
  return hasAny && !isGoalEventComplete(race);
}

export function isGoalEventTimesPartial(race: GoalEventDraft): boolean {
  if (race.disciplines.length <= 1) return false;
  return hasPartialDisciplineGoalTimes({
    disciplines: race.disciplines,
    swimGoalMinutes: race.swimGoalMinutes,
    bikeGoalMinutes: race.bikeGoalMinutes,
    runGoalMinutes: race.runGoalMinutes,
    estimatedDurationMinutes: race.estimatedDurationMinutes,
  });
}

export function goalEventFromApi(event: {
  id?: string;
  name: string;
  date: string;
  disciplines: Discipline[];
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
  taperDaysBefore?: number | null;
  notes?: string | null;
}): GoalEventDraft {
  const disciplines: Discipline[] = event.disciplines?.length ? event.disciplines : ["RUN"];
  const swimGoalMinutes = event.swimGoalMinutes ?? null;
  const bikeGoalMinutes = event.bikeGoalMinutes ?? null;
  const runGoalMinutes = event.runGoalMinutes ?? null;
  let estimatedDurationMinutes = event.estimatedDurationMinutes ?? null;
  if (disciplines.length === 1) {
    const only = disciplines[0]!;
    const legMinutes = goalMinutesForDiscipline(
      { swimGoalMinutes, bikeGoalMinutes, runGoalMinutes },
      only
    );
    if (legMinutes != null) {
      estimatedDurationMinutes = legMinutes;
    }
  }
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    disciplines,
    distanceMeters: event.distanceMeters ?? null,
    estimatedDurationMinutes,
    swimGoalMinutes,
    bikeGoalMinutes,
    runGoalMinutes,
    taperDaysBefore: event.taperDaysBefore ?? null,
    notes: event.notes ?? null,
  };
}

export type DisciplineFocusDraft = {
  discipline: Discipline;
  focus: PhaseFocus;
};

export type { MesocycleDraft };

export type PhaseDraft = {
  id?: string;
  name: string;
  sortOrder: number;
  weekCount: number;
  phaseKind: PhaseKind;
  color: string;
  focusMode: "PHASE" | "DISCIPLINE";
  phaseFocus: PhaseFocus | null;
  disciplineFocuses?: DisciplineFocusDraft[];
  mesocycles?: MesocycleDraft[];
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
  volumeMesocycleMode?: VolumeMesocycleMode;
  volumeStartHours?: number | null;
  volumeEndHours?: number | null;
  longRideStartMin?: number | null;
  longRideEndMin?: number | null;
  longRunStartMin?: number | null;
  longRunEndMin?: number | null;
};

export type SeasonData = {
  id: string;
  setupComplete?: boolean;
  name: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  mesocycleLengthWeeks: number;
  startHours: number;
  peakHours: number;
  maxRampPercent: number;
  deLoadEveryNWeeks: number;
  deLoadWeekFlags?: boolean[] | null;
  deLoadVolumePercent: number;
  deLoadStrategy: string;
  reduceCountsOnDeLoad: boolean;
  longRideStartMin: number;
  longRidePeakMin: number;
  longRunStartMin: number;
  longRunPeakMin: number;
  longRideWeekFlags?: boolean[] | null;
  longRunWeekFlags?: boolean[] | null;
  primaryGoalEvent: (GoalEventDraft & { id: string }) | null;
  goalEvents?: (GoalEventDraft & { id: string; priority: EventPriority })[];
  unlinkedRaceSessions?: UnlinkedRaceSession[];
  phases: PhaseDraft[];
  weeks?: { weekIndex: number; isDeLoadWeek: boolean }[];
};

export const VOLUME_MESOCYCLE_MODES: VolumeMesocycleMode[] = [
  "INCREASE",
  "HOLD",
  "DECREASE",
];

export const VOLUME_MESOCYCLE_MODE_LABELS: Record<VolumeMesocycleMode, string> = {
  INCREASE: "Increase",
  HOLD: "Hold",
  DECREASE: "Decrease",
};

export const PHASE_KINDS: PhaseKind[] = ["BASE", "BUILD", "RACE_PREP", "TAPER"];
export const DISCIPLINES: Discipline[] = ["SWIM", "BIKE", "RUN"];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  SWIM: "Swim",
  BIKE: "Bike",
  RUN: "Run",
};
export const PHASE_FOCUSES: PhaseFocus[] = [
  "AEROBIC_BASE",
  "THRESHOLD",
  "VO2_MAX",
  "RACE_SPECIFICITY",
  "FRESHNESS",
  "STRENGTH_POWER",
  "MAINTENANCE",
];

export const SETUP_STEPS = [
  "Season setup",
  "Cycle structure",
  "De-load cadence",
  "Goals & focus",
  "Volume & ramp",
  "Workouts / week",
] as const;

export type SettingsSectionSlug =
  | "dates"
  | "cycle"
  | "focus"
  | "volume"
  | "workouts"
  | "deload";

export const SETTINGS_SECTIONS: {
  slug: SettingsSectionSlug;
  label: string;
  step: number;
}[] = [
  { slug: "dates", label: "Season setup", step: 0 },
  { slug: "cycle", label: "Cycle structure", step: 1 },
  { slug: "deload", label: "De-load cadence", step: 2 },
  { slug: "focus", label: "Goals & focus", step: 3 },
  { slug: "volume", label: "Volume & ramp", step: 4 },
  { slug: "workouts", label: "Workouts / week", step: 5 },
];

export function sectionSlugToStep(slug: string): number | null {
  const found = SETTINGS_SECTIONS.find((s) => s.slug === slug);
  return found?.step ?? null;
}

export function sectionTitleForStep(step: number): string {
  return SETTINGS_SECTIONS.find((s) => s.step === step)?.label ?? "Season settings";
}

const DISCIPLINE_ORDER: Discipline[] = ["SWIM", "BIKE", "RUN"];

export function sortDisciplines(disciplines: Discipline[]): Discipline[] {
  return [...disciplines].sort(
    (a, b) => DISCIPLINE_ORDER.indexOf(a) - DISCIPLINE_ORDER.indexOf(b)
  );
}

export function formatGoalDisciplines(disciplines: Discipline[]): string {
  const sorted = sortDisciplines(disciplines);
  const labels = sorted.map((d) => DISCIPLINE_LABELS[d]);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} & ${labels[labels.length - 1]}`;
}

export function toggleGoalDiscipline(
  current: Discipline[],
  discipline: Discipline
): Discipline[] | null {
  if (current.includes(discipline)) {
    if (current.length === 1) return null;
    return sortDisciplines(current.filter((d) => d !== discipline));
  }
  return sortDisciplines([...current, discipline]);
}

export function focusLabel(f: PhaseFocus): string {
  return f.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function disciplineFocusesForPhase(phase: PhaseDraft): DisciplineFocusDraft[] {
  const fallback = phase.phaseFocus ?? "AEROBIC_BASE";
  return DISCIPLINES.map((discipline) => {
    const existing = phase.disciplineFocuses?.find((d) => d.discipline === discipline);
    return existing ?? { discipline, focus: fallback };
  });
}

export function phasesForApi(phases: PhaseDraft[]): PhaseDraft[] {
  return phases.map((phase) => ({
    ...phase,
    phaseFocus: phase.focusMode === "PHASE" ? phase.phaseFocus : null,
    disciplineFocuses:
      phase.focusMode === "DISCIPLINE" ? disciplineFocusesForPhase(phase) : undefined,
    mesocycles: phase.mesocycles?.map((m) => ({
      id: m.id,
      name: m.name,
      weekCount: m.weekCount,
    })),
  }));
}

type SerializedMesocycle = {
  id: string;
  name: string;
  index: number;
  startWeekIndex: number;
  endWeekIndex: number;
};

export function normalizePhasesFromApi(
  phases: (Omit<PhaseDraft, "mesocycles"> & {
    mesocycles?: SerializedMesocycle[] | MesocycleDraft[];
  })[],
  mesocycleLengthWeeks: number
): PhaseDraft[] {
  return phases.map((phase) => {
    const raw = phase.mesocycles;
    const serialized =
      raw?.length && "startWeekIndex" in raw[0]!
        ? (raw as SerializedMesocycle[])
        : undefined;
    const drafts =
      raw?.length && "weekCount" in raw[0]! ? (raw as MesocycleDraft[]) : undefined;

    return {
      ...phase,
      disciplineFocuses:
        phase.focusMode === "DISCIPLINE"
          ? disciplineFocusesForPhase(phase as PhaseDraft)
          : phase.disciplineFocuses,
      mesocycles: serialized
        ? mesocyclesFromSerialized(
            serialized,
            phase.name,
            phase.weekCount,
            mesocycleLengthWeeks
          )
        : drafts?.length
          ? drafts
          : defaultMesocycleDrafts(phase.name, phase.weekCount, mesocycleLengthWeeks),
    };
  });
}

export function ensurePhaseMesocycles(phase: PhaseDraft, mesocycleLengthWeeks: number): PhaseDraft {
  if (phase.mesocycles?.length) return phase;
  return {
    ...phase,
    mesocycles: defaultMesocycleDrafts(phase.name, phase.weekCount, mesocycleLengthWeeks),
  };
}

import type {
  DeLoadStrategy,
  Discipline,
  FocusMode,
  PhaseFocus,
  PhaseKind,
  SeasonStatus,
  VolumeMesocycleMode,
} from "@prisma/client";
import type { ZoneMinutes } from "@/lib/workout/steps";

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

export type SeasonDateBounds = DateRange & {
  totalWeeks: number;
};

export type PhaseDisciplineFocus = {
  discipline: Discipline;
  focus: PhaseFocus;
};

export type PhaseMesocycleInput = {
  id?: string;
  name: string;
  weekCount: number;
};

export type SeasonPhaseInput = {
  id?: string;
  name: string;
  sortOrder: number;
  weekCount: number;
  phaseKind: PhaseKind;
  color?: string;
  coachNotes?: string | null;
  focusMode: FocusMode;
  phaseFocus?: PhaseFocus | null;
  disciplineFocuses?: PhaseDisciplineFocus[];
  mesocycles?: PhaseMesocycleInput[];
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
  volumeMesocycleMode?: VolumeMesocycleMode;
  volumeStartHours?: number | null;
  volumeEndHours?: number | null;
  volumeRampPercent?: number | null;
  longRideStartMin?: number | null;
  longRideEndMin?: number | null;
  longRunStartMin?: number | null;
  longRunEndMin?: number | null;
};

export type SeasonPlanComputeInput = {
  startDate: Date;
  endDate: Date;
  mesocycleLengthWeeks: number;
  phases: SeasonPhaseInput[];
  startHours: number;
  peakHours: number;
  maxRampPercent: number;
  deLoadEveryNWeeks: number;
  deLoadWeekFlags?: boolean[] | null;
  deLoadVolumePercent: number;
  deLoadStrategy: DeLoadStrategy;
  reduceCountsOnDeLoad: boolean;
  deLoadCountScalePercent?: number | null;
  longRideStartMin: number;
  longRidePeakMin: number;
  longRunStartMin: number;
  longRunPeakMin: number;
  longRideWeekFlags?: boolean[] | null;
  longRunWeekFlags?: boolean[] | null;
};

export type ComputedMesocycle = {
  phaseIndex: number;
  phaseId?: string;
  name: string;
  index: number;
  startWeekIndex: number;
  endWeekIndex: number;
};

export type WeekPhaseContext = {
  weekIndex: number;
  phaseIndex: number;
  phaseKind: PhaseKind;
  phase: SeasonPhaseInput;
  mesocycleIndex: number;
  mesocycleName: string;
  isDeLoadWeek: boolean;
  weekStartDate: Date;
};

export type ComputedSeasonWeek = {
  weekIndex: number;
  weekStartDate: Date;
  isDeLoadWeek: boolean;
  phaseIndex: number;
  mesocycleIndex: number;
  mesocycleName: string;
  totalHours: number;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  zoneMinutes: ZoneMinutes;
  swimSessions: number;
  bikeSessions: number;
  runSessions: number;
  longRideMinutes: number;
  longRunMinutes: number;
};

export type SeasonRecomputeResult = {
  bounds: SeasonDateBounds;
  mesocycles: ComputedMesocycle[];
  weeks: ComputedSeasonWeek[];
};

export type SeasonOverlapCheck = {
  id?: string;
  startDate: Date;
  endDate: Date;
};

export type DerivedSeasonStatus = Extract<SeasonStatus, "DRAFT" | "ACTIVE" | "COMPLETED">;

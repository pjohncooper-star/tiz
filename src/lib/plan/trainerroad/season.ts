import { addDays } from "date-fns";
import type {
  LongOffWeekPolicy,
  PhaseKind,
  PlanningMode,
  SessionRole,
  VolumeMesocycleMode,
  VolumeProgressionMode,
} from "@prisma/client";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import { formatDateKey, mondayWeekStartKey, parseDateKey } from "@/lib/dates";
import { defaultPhaseForKind } from "@/lib/plan/season/default-phases";
import { buildSeasonDateBounds, weekIndexForDate } from "@/lib/plan/season/season-dates";
import { roundHours } from "@/lib/plan/season/volume-curve";
import type { PhaseZoneSplits } from "@/lib/plan/season/zone-split-types";
import type { ParsedTrainerRoadCalendar } from "./calendar";
import { trainerRoadMarkersToPhaseSpans } from "./phases";

export type TrainerRoadSeasonOverlap = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export class TrainerRoadSeasonOverlapError extends Error {
  readonly overlapping: TrainerRoadSeasonOverlap[];

  constructor(overlapping: TrainerRoadSeasonOverlap[]) {
    const listed = overlapping
      .map((season) => `${season.name} (${season.startDate} → ${season.endDate})`)
      .join("; ");
    super(
      `Season dates overlap an existing season: ${listed}. Archive or shorten that season, then try again.`
    );
    this.name = "TrainerRoadSeasonOverlapError";
    this.overlapping = overlapping;
  }
}

export type TrainerRoadSeasonPhase = {
  id?: string;
  name: string;
  color: string;
  phaseKind: PhaseKind;
  startWeekIndex: number;
  endWeekIndex: number;
  rampEnabled: { swim: boolean; bike: boolean; run: boolean };
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
  strengthSessionsPerWeek: number;
  swimIntenseDaysPerWeek: number;
  bikeIntenseDaysPerWeek: number;
  runIntenseDaysPerWeek: number;
  goal?: string | null;
  zoneSplits?: PhaseZoneSplits | null;
  weeklyTemplateId?: string | null;
  planningMode?: PlanningMode | null;
  longRideStartMin?: number | null;
  longRideEndMin?: number | null;
  longRunStartMin?: number | null;
  longRunEndMin?: number | null;
  longRideOffWeekPolicy?: LongOffWeekPolicy;
  longRunOffWeekPolicy?: LongOffWeekPolicy;
  longRideOffWeekEndurancePercent?: number;
  longRunOffWeekEndurancePercent?: number;
  volumeMesocycleMode?: VolumeMesocycleMode | null;
  volumeProgressionMode?: VolumeProgressionMode | null;
  volumeStartHours?: number | null;
  volumeEndHours?: number | null;
  volumeRampPercent?: number | null;
  volumeStepHours?: number | null;
  swimStartHours?: number | null;
  swimEndHours?: number | null;
  swimRampPercent?: number | null;
  swimStepHours?: number | null;
  bikeStartHours?: number | null;
  bikeEndHours?: number | null;
  bikeRampPercent?: number | null;
  bikeStepHours?: number | null;
  runStartHours?: number | null;
  runEndHours?: number | null;
  runRampPercent?: number | null;
  runStepHours?: number | null;
};

export type TrainerRoadSeasonDraft = {
  name: string;
  startDateKey: string;
  endDateKey: string;
  phases: TrainerRoadSeasonPhase[];
};

export type TrainerRoadSeasonWindow = {
  startDateKey: string;
  endDateKey: string;
};

export function lastTrainerRoadWorkoutDateKey(
  calendar: ParsedTrainerRoadCalendar
): string | undefined {
  if (calendar.workouts.length === 0) return undefined;
  return calendar.workouts.reduce(
    (latest, workout) => (workout.dateKey > latest ? workout.dateKey : latest),
    calendar.workouts[0]!.dateKey
  );
}

function seasonNameFromCalendar(calendar: ParsedTrainerRoadCalendar): string {
  const name = calendar.calendarName?.trim();
  return name || "TrainerRoad";
}

function markersInWindow(
  markers: ParsedTrainerRoadCalendar["phaseMarkers"],
  window: TrainerRoadSeasonWindow
) {
  const startMonday = mondayWeekStartKey(window.startDateKey);
  return markers.filter((marker) => {
    const monday = mondayWeekStartKey(marker.weekStartDate || marker.dateKey);
    return monday >= startMonday && monday <= window.endDateKey;
  });
}

export function trainerRoadCalendarToSeasonDraft(
  calendar: ParsedTrainerRoadCalendar,
  window?: TrainerRoadSeasonWindow
): TrainerRoadSeasonDraft | null {
  const markers = window ? markersInWindow(calendar.phaseMarkers, window) : calendar.phaseMarkers;
  const lastWorkoutDateKey = window ? undefined : lastTrainerRoadWorkoutDateKey(calendar);
  const spans = trainerRoadMarkersToPhaseSpans(markers, {
    lastWorkoutDateKey,
    seasonEndDateKey: window?.endDateKey,
  });
  if (spans.length === 0) return null;

  const lastSpan = spans[spans.length - 1]!;
  const lastPhaseEnd = addDays(parseDateKey(lastSpan.weekStartDate), lastSpan.weekCount * 7 - 1);
  const endCandidate = lastWorkoutDateKey
    ? lastWorkoutDateKey > formatDateKey(lastPhaseEnd)
      ? parseDateKey(lastWorkoutDateKey)
      : lastPhaseEnd
    : lastPhaseEnd;
  const bounds = window
    ? buildSeasonDateBounds(parseDateKey(window.startDateKey), parseDateKey(window.endDateKey))
    : buildSeasonDateBounds(parseDateKey(spans[0]!.weekStartDate), endCandidate);

  const phases = spans.map((span, index) => {
    const input = defaultPhaseForKind(span.phaseKind, span.weekCount, index, span.name);
    const startWeekIndex = weekIndexForDate(bounds.startDate, parseDateKey(span.weekStartDate));
    return {
      name: input.name,
      color: input.color ?? "#38bdf8",
      phaseKind: input.phaseKind,
      startWeekIndex,
      endWeekIndex: startWeekIndex + span.weekCount - 1,
      rampEnabled: { swim: true, bike: false, run: true },
      swimSessionsPerWeek: input.swimSessionsPerWeek,
      bikeSessionsPerWeek: 0,
      runSessionsPerWeek: input.runSessionsPerWeek,
      strengthSessionsPerWeek: 2,
      swimIntenseDaysPerWeek: 1,
      bikeIntenseDaysPerWeek: 0,
      runIntenseDaysPerWeek: 1,
    } satisfies TrainerRoadSeasonPhase;
  });

  return {
    name: seasonNameFromCalendar(calendar),
    startDateKey: formatDateKey(bounds.startDate),
    endDateKey: formatDateKey(bounds.endDate),
    phases,
  };
}

function assignedWeekOverlap(a: TrainerRoadSeasonPhase, b: TrainerRoadSeasonPhase): number {
  if (a.startWeekIndex < 0 || b.startWeekIndex < 0) return 0;
  const start = Math.max(a.startWeekIndex, b.startWeekIndex);
  const end = Math.min(a.endWeekIndex, b.endWeekIndex);
  return Math.max(0, end - start + 1);
}

function copySwimRunFields(
  incoming: TrainerRoadSeasonPhase,
  previous: TrainerRoadSeasonPhase
): TrainerRoadSeasonPhase {
  return {
    ...incoming,
    id: previous.id,
    swimSessionsPerWeek: previous.swimSessionsPerWeek,
    runSessionsPerWeek: previous.runSessionsPerWeek,
    strengthSessionsPerWeek: previous.strengthSessionsPerWeek,
    swimIntenseDaysPerWeek: previous.swimIntenseDaysPerWeek,
    runIntenseDaysPerWeek: previous.runIntenseDaysPerWeek,
    goal: previous.goal,
    zoneSplits: previous.zoneSplits,
    weeklyTemplateId: previous.weeklyTemplateId,
    planningMode: previous.planningMode,
    rampEnabled: {
      swim: previous.rampEnabled.swim,
      bike: false,
      run: previous.rampEnabled.run,
    },
    longRunStartMin: previous.longRunStartMin,
    longRunEndMin: previous.longRunEndMin,
    longRunOffWeekPolicy: previous.longRunOffWeekPolicy,
    longRunOffWeekEndurancePercent: previous.longRunOffWeekEndurancePercent,
    swimStartHours: previous.swimStartHours,
    swimEndHours: previous.swimEndHours,
    swimRampPercent: previous.swimRampPercent,
    swimStepHours: previous.swimStepHours,
    runStartHours: previous.runStartHours,
    runEndHours: previous.runEndHours,
    runRampPercent: previous.runRampPercent,
    runStepHours: previous.runStepHours,
  };
}

/** Rebuild TR phase structure; keep swim/run settings from overlapping prior phases. */
export function mergeTrainerRoadPhaseWrites(
  incoming: TrainerRoadSeasonPhase[],
  existing: TrainerRoadSeasonPhase[]
): TrainerRoadSeasonPhase[] {
  if (existing.length === 0) return incoming;
  const usedIds = new Set<string>();
  return incoming.map((next) => {
    let best: TrainerRoadSeasonPhase | undefined;
    let bestOverlap = 0;
    for (const prev of existing) {
      const overlap = assignedWeekOverlap(next, prev);
      if (overlap > bestOverlap) {
        best = prev;
        bestOverlap = overlap;
      }
    }
    if (bestOverlap === 0) {
      best = existing.find(
        (prev) => prev.name === next.name && prev.phaseKind === next.phaseKind
      );
    }
    if (!best) return next;
    const copied = copySwimRunFields(next, best);
    if (copied.id && usedIds.has(copied.id)) {
      return { ...copied, id: undefined };
    }
    if (copied.id) usedIds.add(copied.id);
    return copied;
  });
}

export type TrainerRoadBikeSession = {
  dateKey: string;
  durationMinutes: number | null;
  targetZones?: Record<string, number> | null;
  sessionRole?: SessionRole | null;
};

function parseZoneMinutes(raw: Record<string, number> | null | undefined): Record<string, number> {
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && value > 0) out[key] = value;
  }
  return out;
}

function emptyBikeSlotBudget() {
  return {
    endurance: 0,
    intensity: 0,
    long: 0,
    substituteEndurance: 0,
    substituteDurationMinutes: 0,
  };
}

/** Replace bike hour/zone/session targets with TrainerRoad sessions in that week. */
export function applyTrainerRoadBikeWeekTarget(
  target: CalendarWeekTarget,
  sessions: TrainerRoadBikeSession[]
): CalendarWeekTarget {
  const weekStart = target.weekStart;
  const weekEnd = formatDateKey(addDays(parseDateKey(weekStart), 6));
  const inWeek = sessions.filter(
    (session) => session.dateKey >= weekStart && session.dateKey <= weekEnd
  );

  let minutes = 0;
  const bikeZones: Record<string, number> = {};
  const intenseDays = new Set<string>();
  for (const session of inWeek) {
    if (session.durationMinutes != null && session.durationMinutes > 0) {
      minutes += session.durationMinutes;
    }
    for (const [key, value] of Object.entries(parseZoneMinutes(session.targetZones))) {
      if (!key.startsWith("BIKE-")) continue;
      bikeZones[key] = (bikeZones[key] ?? 0) + value;
    }
    if (session.sessionRole === "INTENSITY") intenseDays.add(session.dateKey);
  }

  const bikeHours = roundHours(minutes / 60);
  const byDiscipline = target.byDiscipline.map((row) => {
    if (row.discipline !== "BIKE") return row;
    return {
      ...row,
      hours: bikeHours,
      zoneMinutes: bikeZones,
      sessionsPerWeek: inWeek.length,
      intenseDaysPerWeek: intenseDays.size,
    };
  });
  const swimHours = byDiscipline.find((row) => row.discipline === "SWIM")?.hours ?? 0;
  const runHours = byDiscipline.find((row) => row.discipline === "RUN")?.hours ?? 0;
  const zoneMinutes = { ...target.zoneMinutes };
  for (const key of Object.keys(zoneMinutes)) {
    if (key.startsWith("BIKE-")) delete zoneMinutes[key];
  }
  Object.assign(zoneMinutes, bikeZones);

  return {
    ...target,
    totalHours: roundHours(swimHours + bikeHours + runHours),
    byDiscipline,
    zoneMinutes,
    slotBudgets: target.slotBudgets
      ? { ...target.slotBudgets, BIKE: emptyBikeSlotBudget() }
      : target.slotBudgets,
  };
}

export function trainerRoadSessionsByWeekStart(
  sessions: TrainerRoadBikeSession[]
): Map<string, TrainerRoadBikeSession[]> {
  const byWeek = new Map<string, TrainerRoadBikeSession[]>();
  for (const session of sessions) {
    const weekStart = mondayWeekStartKey(session.dateKey);
    const list = byWeek.get(weekStart) ?? [];
    list.push(session);
    byWeek.set(weekStart, list);
  }
  return byWeek;
}

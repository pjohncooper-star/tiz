import { Prisma, type DeLoadStrategy, type PhaseKind } from "@prisma/client";
import { db } from "@/lib/db";
import { calendarDateFromDb, formatDateKey } from "@/lib/dates";
import {
  createGoalEventsWithCalendar,
  linkCalendarRacesToPlan,
  removeGoalEvents,
  syncGoalEventsByPriority,
  upsertPrimaryGoalEvent,
  type GoalEventWriteInput,
  type LinkCalendarRaceInput,
  type RemovedGoalEventInput,
} from "./goal-events-sync";
import {
  assertNoSeasonOverlap,
  findOverlappingSeasonPlans,
  formatSeasonOverlapError,
  getSeasonPlanById,
  type SeasonPlanSummary,
} from "./season-plan.server";
import {
  buildSeasonDateBounds,
  deriveSeasonStatus,
  weekStartDateForIndex,
} from "./season-dates";
import {
  buildPhaseSpansFromDb,
  defaultSimpleRampDefaults,
  rampBaseWeekIndex,
  rampDefaultsToPlanFields,
  recalculateSimpleVolumes,
  resolveSimpleRampDefaults,
  syncDerivedDistanceOrHours,
  type SimpleDiscipline,
  type SimplePhaseVolumeSpan,
  type SimpleRampDefaults,
  type SimpleWeekVolume,
} from "./simple-ramp";
import {
  recalculateSimpleLongSessions,
  resolveSimpleLongSessionDefaults,
  type SimpleLongSessionDefaults,
} from "./simple-long-session";
import { normalizePhasesToFullCoverage } from "./phase-span-utils";
import {
  clampZoneMinutesToVolume,
  defaultZoneRampDefaults,
  parseDisciplineZoneMinutes,
  parseZoneRampDefaults,
  type SimpleWeekWithZones,
  type ZoneRampDefaultsByDiscipline,
} from "./simple-tiz";
import {
  defaultPhaseKindZoneDefaults,
  parsePhaseKindZoneDefaults,
  resolvePhaseZoneSplits,
  serializePhaseKindZoneDefaults,
} from "./phase-zone-defaults";
import type { PhaseKindZoneDefaults, PhaseZoneSplits } from "./zone-split-types";
import {
  recalculateZoneMinutesFromSplits,
  type ZonePhaseSpan,
} from "./zone-split";
import { type ZoneMinutes } from "@/lib/workout/steps";
import { roundHours } from "./volume-curve";
import {
  parsePhaseCoachNotes,
  serializePhaseCoachNotes,
} from "./simple-phase-notes";
import {
  inferPhaseKindFromVolumeSettings,
  resolvePhaseVolumeSettings,
  volumeMesocycleModeToDb,
  volumeTrendFromDb,
  type LongSessionCadence,
  type SimplePhaseVolumeTrend,
} from "./phase-volume-settings";
import {
  serializeGoalEvent,
  serializeUnlinkedRaceSession,
} from "./serialize";
import { findUnlinkedRaceSessions } from "@/lib/plan/race-calendar-sync";
import {
  applyRecoveryVolumeHours,
  applyRecoveryZonesForWeek,
  DEFAULT_RECOVERY_SETTINGS,
  resolveRecoverySettings,
  suggestRecoveryWeeks,
  recoverySuppressedWeekIndices,
  type RecoverySettings,
  type RecoveryZoneMode,
} from "./recovery";

function cuid(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

export type SimplePhaseWrite = {
  id?: string;
  name: string;
  color: string;
  phaseKind?: PhaseKind;
  startWeekIndex: number;
  endWeekIndex: number;
  rampEnabled: Record<SimpleDiscipline, boolean>;
  swimSessionsPerWeek: number;
  bikeSessionsPerWeek: number;
  runSessionsPerWeek: number;
  strengthSessionsPerWeek: number;
  swimIntenseDaysPerWeek: number;
  bikeIntenseDaysPerWeek: number;
  runIntenseDaysPerWeek: number;
  goal?: string | null;
  volumeTrend?: SimplePhaseVolumeTrend;
  volumeTargetPercent?: number;
  volumeTaperStartPercent?: number;
  volumeTaperEndPercent?: number;
  longSessionCadence?: LongSessionCadence;
  suppressRecovery?: boolean;
  zoneSplits?: PhaseZoneSplits | null;
};

export type SimpleWeekWrite = {
  weekIndex: number;
  isRestWeek: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  swimDistanceMeters?: number | null;
  runDistanceMeters?: number | null;
  zoneMinutes?: ZoneMinutes;
  zoneMinutesOverridden?: boolean;
  volumeOverridden?: boolean;
};

export type RecoverySettingsWrite = {
  volumePercent?: number;
  loadWeeks?: number;
  zoneMode?: RecoveryZoneMode;
  highZoneCutPercent?: number;
  sessionScalePercent?: number | null;
};

export type CreateSimpleSeasonInput = {
  athleteId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  rampDefaults?: SimpleRampDefaults;
  zoneRampDefaults?: ZoneRampDefaultsByDiscipline;
  phaseKindZoneDefaults?: PhaseKindZoneDefaults;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
};

export type UpdateSimpleSeasonInput = {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  rampDefaults?: SimpleRampDefaults;
  zoneRampDefaults?: ZoneRampDefaultsByDiscipline;
  phaseKindZoneDefaults?: PhaseKindZoneDefaults;
  phases?: SimplePhaseWrite[];
  weeks?: SimpleWeekWrite[];
  recalculate?: boolean;
  resetZoneOverrides?: boolean;
  applyRecoveryCadence?: boolean;
  recovery?: RecoverySettingsWrite;
  goalEvent?: GoalEventWriteInput;
  bGoalEvents?: GoalEventWriteInput[];
  cGoalEvents?: GoalEventWriteInput[];
  removedGoalEvents?: RemovedGoalEventInput[];
  linkCalendarRaces?: LinkCalendarRaceInput[];
  longSessionDefaults?: SimpleLongSessionDefaults;
};

function phaseWritesToDb(phases: SimplePhaseWrite[]) {
  return [...phases]
    .sort((a, b) => {
      const aStart = a.startWeekIndex < 0 ? Number.MAX_SAFE_INTEGER : a.startWeekIndex;
      const bStart = b.startWeekIndex < 0 ? Number.MAX_SAFE_INTEGER : b.startWeekIndex;
      return aStart - bStart;
    })
    .map((phase, sortOrder) => {
      const assigned = phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex;
      const volume = resolvePhaseVolumeSettings({
        volumeTrend: phase.volumeTrend,
        volumeTargetPercent: phase.volumeTargetPercent,
        volumeTaperStartPercent: phase.volumeTaperStartPercent,
        volumeTaperEndPercent: phase.volumeTaperEndPercent,
        longSessionCadence: phase.longSessionCadence,
        suppressRecovery: phase.suppressRecovery,
        name: phase.name,
      });
      return {
        id: phase.id ?? cuid(),
        name: phase.name.trim() || `Phase ${sortOrder + 1}`,
        sortOrder,
        weekCount: assigned ? phase.endWeekIndex - phase.startWeekIndex + 1 : 0,
        startWeekIndex: assigned ? phase.startWeekIndex : -1,
        color: phase.color || "#38bdf8",
        rampSwimEnabled: phase.rampEnabled.swim,
        rampBikeEnabled: phase.rampEnabled.bike,
        rampRunEnabled: phase.rampEnabled.run,
        swimSessionsPerWeek: Math.max(0, Math.round(phase.swimSessionsPerWeek)),
        bikeSessionsPerWeek: Math.max(0, Math.round(phase.bikeSessionsPerWeek)),
        runSessionsPerWeek: Math.max(0, Math.round(phase.runSessionsPerWeek)),
        volumeMesocycleMode: volumeMesocycleModeToDb(volume.volumeTrend),
        phaseKind: phase.phaseKind ?? inferPhaseKindFromVolumeSettings(volume),
        coachNotes: serializePhaseCoachNotes({
          goal: phase.goal ?? null,
          strengthSessionsPerWeek: phase.strengthSessionsPerWeek,
          swimIntenseDaysPerWeek: phase.swimIntenseDaysPerWeek,
          bikeIntenseDaysPerWeek: phase.bikeIntenseDaysPerWeek,
          runIntenseDaysPerWeek: phase.runIntenseDaysPerWeek,
          volumeTrend: volume.volumeTrend,
          isTaperVolume: volume.volumeTrend === "TAPER",
          volumeTargetPercent: volume.volumeTargetPercent,
          volumeTaperStartPercent: volume.volumeTaperStartPercent,
          volumeTaperEndPercent: volume.volumeTaperEndPercent,
          longSessionCadence: volume.longSessionCadence,
          suppressRecovery: volume.suppressRecovery,
          zoneSplits: phase.zoneSplits ?? null,
        }),
      };
    });
}

function toWeekWithZones(week: SimpleWeekVolume & {
  zoneMinutes?: ZoneMinutes;
  zoneMinutesOverridden?: boolean;
  volumeOverridden?: boolean;
}): SimpleWeekWithZones {
  return {
    weekIndex: week.weekIndex,
    isRestWeek: week.isRestWeek,
    volumeOverridden: week.volumeOverridden,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    zoneMinutes: week.zoneMinutes ?? {},
    zoneMinutesOverridden: week.zoneMinutesOverridden,
  };
}

function zonePhaseSpansFromWrites(
  phases: SimplePhaseWrite[],
  kindDefaults: PhaseKindZoneDefaults
): ZonePhaseSpan[] {
  return phases
    .filter((phase) => phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex)
    .map((phase) => {
      const volume = resolvePhaseVolumeSettings({
        volumeTrend: phase.volumeTrend,
        volumeTargetPercent: phase.volumeTargetPercent,
        volumeTaperStartPercent: phase.volumeTaperStartPercent,
        volumeTaperEndPercent: phase.volumeTaperEndPercent,
        longSessionCadence: phase.longSessionCadence,
        suppressRecovery: phase.suppressRecovery,
        phaseKind: phase.phaseKind,
        name: phase.name,
      });
      const phaseKind = phase.phaseKind ?? inferPhaseKindFromVolumeSettings(volume);
      return {
        startWeekIndex: phase.startWeekIndex,
        endWeekIndex: phase.endWeekIndex,
        rampEnabled: phase.rampEnabled,
        zoneSplits: resolvePhaseZoneSplits({
          phaseKind,
          phaseZoneSplits: phase.zoneSplits,
          kindDefaults,
        }),
      };
    });
}

function zonePhaseSpansFromDb(
  phases: NonNullable<Awaited<ReturnType<typeof getSeasonPlanById>>>["phases"],
  kindDefaults: PhaseKindZoneDefaults
): ZonePhaseSpan[] {
  let cursor = 0;
  return [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((phase) => phase.weekCount > 0)
    .map((phase) => {
      const hasStoredStart = "startWeekIndex" in phase && phase.startWeekIndex >= 0;
      const startWeekIndex = hasStoredStart ? phase.startWeekIndex : cursor;
      const endWeekIndex = startWeekIndex + phase.weekCount - 1;
      if (!hasStoredStart) cursor += phase.weekCount;
      const notes = parsePhaseCoachNotes(phase.coachNotes);
      return {
        startWeekIndex,
        endWeekIndex,
        rampEnabled: {
          swim: phase.rampSwimEnabled,
          bike: phase.rampBikeEnabled,
          run: phase.rampRunEnabled,
        },
        zoneSplits: resolvePhaseZoneSplits({
          phaseKind: phase.phaseKind,
          phaseZoneSplits: notes.zoneSplits,
          kindDefaults,
        }),
      };
    });
}

function buildInitialWeeks(
  totalWeeks: number,
  defaults: SimpleRampDefaults,
  kindDefaults: PhaseKindZoneDefaults,
  deLoadStrategy: DeLoadStrategy
): Array<SimpleWeekVolume & { zoneMinutes: ZoneMinutes; zoneMinutesOverridden: boolean }> {
  const weeks: SimpleWeekVolume[] = Array.from({ length: totalWeeks }, (_, weekIndex) => ({
    weekIndex,
    isRestWeek: false,
    swimHours: defaults.swim.startHours,
    bikeHours: defaults.bike.startHours,
    runHours: defaults.run.startHours,
    totalHours: roundHours(
      defaults.swim.startHours + defaults.bike.startHours + defaults.run.startHours
    ),
    swimDistanceMeters:
      defaults.swim.mode === "DISTANCE" ? defaults.swim.startDistanceMeters : null,
    runDistanceMeters:
      defaults.run.mode === "DISTANCE" ? defaults.run.startDistanceMeters : null,
  }));

  const volumeWeeks = recalculateSimpleVolumes(weeks, [], defaults);
  const zoneMinutesList = recalculateZoneMinutesFromSplits(
    volumeWeeks.map((week) => ({
      weekIndex: week.weekIndex,
      isRestWeek: week.isRestWeek,
      swimHours: week.swimHours,
      bikeHours: week.bikeHours,
      runHours: week.runHours,
    })),
    [],
    deLoadStrategy
  );

  return volumeWeeks.map((week, index) => ({
    ...week,
    zoneMinutes: zoneMinutesList[index]!,
    zoneMinutesOverridden: false,
    longRideMinutes: 0,
    longRunMinutes: 0,
  }));
}

function mergeWeekWrites(
  existingWeeks: Array<
    SimpleWeekVolume & {
      zoneMinutes?: ZoneMinutes;
      zoneMinutesOverridden?: boolean;
      longRideMinutes?: number;
      longRunMinutes?: number;
    }
  >,
  writes: SimpleWeekWrite[] | undefined,
  totalWeeks: number,
  defaults: SimpleRampDefaults
): Array<
  SimpleWeekVolume & {
    zoneMinutes: ZoneMinutes;
    zoneMinutesOverridden: boolean;
    volumeOverridden: boolean;
    longRideMinutes: number;
    longRunMinutes: number;
  }
> {
  const byIndex = new Map<number, SimpleWeekWrite>();
  for (const write of writes ?? []) {
    byIndex.set(write.weekIndex, write);
  }

  const weeks: Array<
    SimpleWeekVolume & {
      zoneMinutes: ZoneMinutes;
      zoneMinutesOverridden: boolean;
      volumeOverridden: boolean;
      longRideMinutes: number;
      longRunMinutes: number;
    }
  > = [];
  for (let weekIndex = 0; weekIndex < totalWeeks; weekIndex++) {
    const write = byIndex.get(weekIndex);
    const prior = existingWeeks[weekIndex];
    const swimHours = write?.swimHours ?? prior?.swimHours ?? defaults.swim.startHours;
    const bikeHours = write?.bikeHours ?? prior?.bikeHours ?? defaults.bike.startHours;
    const runHours = write?.runHours ?? prior?.runHours ?? defaults.run.startHours;
    weeks.push({
      weekIndex,
      isRestWeek: write?.isRestWeek ?? prior?.isRestWeek ?? false,
      volumeOverridden: write?.volumeOverridden ?? prior?.volumeOverridden ?? false,
      swimHours,
      bikeHours,
      runHours,
      totalHours: roundHours(swimHours + bikeHours + runHours),
      swimDistanceMeters: write?.swimDistanceMeters ?? prior?.swimDistanceMeters ?? null,
      runDistanceMeters: write?.runDistanceMeters ?? prior?.runDistanceMeters ?? null,
      zoneMinutes: write?.zoneMinutes ?? prior?.zoneMinutes ?? {},
      zoneMinutesOverridden:
        write?.zoneMinutesOverridden ?? prior?.zoneMinutesOverridden ?? false,
      longRideMinutes: prior?.longRideMinutes ?? 0,
      longRunMinutes: prior?.longRunMinutes ?? 0,
    });
  }
  return weeks;
}

function weeksFromDb(
  weeks: {
    weekIndex: number;
    isDeLoadWeek: boolean;
    swimHours: number;
    bikeHours: number;
    runHours: number;
    totalHours: number;
    swimDistanceMeters: number | null;
    runDistanceMeters: number | null;
    zoneMinutes: unknown;
    zoneMinutesOverridden: boolean;
    volumeOverridden: boolean;
    longRideMinutes: number;
    longRunMinutes: number;
  }[]
): Array<
  SimpleWeekVolume & {
    zoneMinutes: ZoneMinutes;
    zoneMinutesOverridden: boolean;
    volumeOverridden: boolean;
    longRideMinutes: number;
    longRunMinutes: number;
  }
> {
  return weeks.map((week) => ({
    weekIndex: week.weekIndex,
    isRestWeek: week.isDeLoadWeek,
    volumeOverridden: week.volumeOverridden ?? false,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
    totalHours: week.totalHours,
    swimDistanceMeters: week.swimDistanceMeters,
    runDistanceMeters: week.runDistanceMeters,
    zoneMinutes: parseDisciplineZoneMinutes(week.zoneMinutes),
    zoneMinutesOverridden: week.zoneMinutesOverridden,
    longRideMinutes: week.longRideMinutes,
    longRunMinutes: week.longRunMinutes,
  }));
}

function simplePhasesFromDb(
  phases: Array<{
    id: string;
    name: string;
    color: string;
    sortOrder: number;
    weekCount: number;
    startWeekIndex: number;
    rampSwimEnabled: boolean;
    rampBikeEnabled: boolean;
    rampRunEnabled: boolean;
    swimSessionsPerWeek: number;
    bikeSessionsPerWeek: number;
    runSessionsPerWeek: number;
    volumeMesocycleMode: import("@prisma/client").VolumeMesocycleMode;
    phaseKind: import("@prisma/client").PhaseKind;
    coachNotes: string | null;
  }>,
  totalWeeks: number
): import("@/components/simple-planner/simple-planner-types").SimplePhase[] {
  let cursor = 0;
  const mapped = [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((phase) => {
      const hasStoredStart = phase.startWeekIndex >= 0;
      const assigned = phase.weekCount > 0;
      const startWeekIndex = assigned ? (hasStoredStart ? phase.startWeekIndex : cursor) : -1;
      const endWeekIndex = assigned ? startWeekIndex + phase.weekCount - 1 : -1;
      if (assigned && !hasStoredStart) cursor += phase.weekCount;
      const notes = parsePhaseCoachNotes(phase.coachNotes);
      const volume = resolvePhaseVolumeSettings({
        volumeTrend:
          notes.volumeTrend ?? volumeTrendFromDb(phase.volumeMesocycleMode, notes.isTaperVolume),
        volumeTargetPercent: notes.volumeTargetPercent,
        volumeTaperStartPercent: notes.volumeTaperStartPercent,
        volumeTaperEndPercent: notes.volumeTaperEndPercent,
        longSessionCadence: notes.longSessionCadence,
        suppressRecovery: notes.suppressRecovery,
        phaseKind: phase.phaseKind,
        name: phase.name,
      });
      return {
        id: phase.id,
        name: phase.name,
        color: phase.color,
        phaseKind: phase.phaseKind,
        startWeekIndex,
        endWeekIndex,
        rampEnabled: {
          swim: phase.rampSwimEnabled,
          bike: phase.rampBikeEnabled,
          run: phase.rampRunEnabled,
        },
        swimSessionsPerWeek: phase.swimSessionsPerWeek,
        bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
        runSessionsPerWeek: phase.runSessionsPerWeek,
        strengthSessionsPerWeek: notes.strengthSessionsPerWeek,
        swimIntenseDaysPerWeek: notes.swimIntenseDaysPerWeek,
        bikeIntenseDaysPerWeek: notes.bikeIntenseDaysPerWeek,
        runIntenseDaysPerWeek: notes.runIntenseDaysPerWeek,
        goal: notes.goal,
        volumeTrend: volume.volumeTrend,
        volumeTargetPercent: volume.volumeTargetPercent,
        volumeTaperStartPercent: volume.volumeTaperStartPercent,
        volumeTaperEndPercent: volume.volumeTaperEndPercent,
        longSessionCadence: volume.longSessionCadence,
        suppressRecovery: volume.suppressRecovery,
        zoneSplits: notes.zoneSplits,
      };
    });
  return normalizePhasesToFullCoverage(mapped, totalWeeks);
}

function attachLongSessionsToWeeks<
  T extends { weekIndex: number; isRestWeek: boolean },
>(
  weeks: T[],
  phases: import("@/components/simple-planner/simple-planner-types").SimplePhase[],
  longDefaults: SimpleLongSessionDefaults,
  rampDefaults: SimpleRampDefaults
): Array<T & { longRideMinutes: number; longRunMinutes: number }> {
  const longSessions = recalculateSimpleLongSessions({
    weeks,
    phases,
    longDefaults,
    rampDefaults,
  });
  return weeks.map((week, index) => ({
    ...week,
    longRideMinutes: longSessions[index]?.longRideMinutes ?? 0,
    longRunMinutes: longSessions[index]?.longRunMinutes ?? 0,
  }));
}

function phaseSpansFromWrites(phases: SimplePhaseWrite[]): SimplePhaseVolumeSpan[] {
  return phases
    .filter((phase) => phase.startWeekIndex >= 0 && phase.endWeekIndex >= phase.startWeekIndex)
    .map((phase) => {
      const volume = resolvePhaseVolumeSettings({
        volumeTrend: phase.volumeTrend,
        volumeTargetPercent: phase.volumeTargetPercent,
        volumeTaperStartPercent: phase.volumeTaperStartPercent,
        volumeTaperEndPercent: phase.volumeTaperEndPercent,
        longSessionCadence: phase.longSessionCadence,
        suppressRecovery: phase.suppressRecovery,
        name: phase.name,
      });
      return {
        startWeekIndex: phase.startWeekIndex,
        endWeekIndex: phase.endWeekIndex,
        rampEnabled: phase.rampEnabled,
        volumeTrend: volume.volumeTrend,
        volumeTargetPercent: volume.volumeTargetPercent,
        volumeTaperStartPercent: volume.volumeTaperStartPercent,
        volumeTaperEndPercent: volume.volumeTaperEndPercent,
      };
    });
}

function toSimplePhase(phase: SimplePhaseWrite): import("@/components/simple-planner/simple-planner-types").SimplePhase {
  const volume = resolvePhaseVolumeSettings({
    volumeTrend: phase.volumeTrend,
    volumeTargetPercent: phase.volumeTargetPercent,
    volumeTaperStartPercent: phase.volumeTaperStartPercent,
    volumeTaperEndPercent: phase.volumeTaperEndPercent,
    longSessionCadence: phase.longSessionCadence,
    suppressRecovery: phase.suppressRecovery,
    name: phase.name,
  });
  const phaseKind = phase.phaseKind ?? inferPhaseKindFromVolumeSettings(volume);
  return {
    id: phase.id,
    name: phase.name,
    color: phase.color,
    phaseKind,
    startWeekIndex: phase.startWeekIndex,
    endWeekIndex: phase.endWeekIndex,
    rampEnabled: phase.rampEnabled,
    swimSessionsPerWeek: phase.swimSessionsPerWeek,
    bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
    runSessionsPerWeek: phase.runSessionsPerWeek,
    strengthSessionsPerWeek: phase.strengthSessionsPerWeek,
    swimIntenseDaysPerWeek: phase.swimIntenseDaysPerWeek,
    bikeIntenseDaysPerWeek: phase.bikeIntenseDaysPerWeek,
    runIntenseDaysPerWeek: phase.runIntenseDaysPerWeek,
    goal: phase.goal ?? null,
    volumeTrend: volume.volumeTrend,
    volumeTargetPercent: volume.volumeTargetPercent,
    volumeTaperStartPercent: volume.volumeTaperStartPercent,
    volumeTaperEndPercent: volume.volumeTaperEndPercent,
    longSessionCadence: volume.longSessionCadence,
    suppressRecovery: volume.suppressRecovery,
    zoneSplits: phase.zoneSplits ?? null,
  };
}

function buildPhaseVolumeSpansFromExisting(
  phases: Array<{
    sortOrder: number;
    weekCount: number;
    startWeekIndex: number;
    rampSwimEnabled: boolean;
    rampBikeEnabled: boolean;
    rampRunEnabled: boolean;
    volumeMesocycleMode: import("@prisma/client").VolumeMesocycleMode;
    phaseKind: import("@prisma/client").PhaseKind;
    coachNotes: string | null;
    name: string;
  }>
): SimplePhaseVolumeSpan[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  let cursor = 0;
  return sorted.map((phase) => {
    const hasStoredStart = phase.startWeekIndex >= 0;
    const startWeekIndex = hasStoredStart ? phase.startWeekIndex : cursor;
    const endWeekIndex = startWeekIndex + Math.max(phase.weekCount, 1) - 1;
    if (!hasStoredStart) cursor += phase.weekCount;

    const notes = parsePhaseCoachNotes(phase.coachNotes);
    const volume = resolvePhaseVolumeSettings({
      volumeTrend:
        notes.volumeTrend ?? volumeTrendFromDb(phase.volumeMesocycleMode, notes.isTaperVolume),
      volumeTargetPercent: notes.volumeTargetPercent,
      volumeTaperStartPercent: notes.volumeTaperStartPercent,
      volumeTaperEndPercent: notes.volumeTaperEndPercent,
      longSessionCadence: notes.longSessionCadence,
      suppressRecovery: notes.suppressRecovery,
      phaseKind: phase.phaseKind,
      name: phase.name,
    });

    return {
      startWeekIndex,
      endWeekIndex,
      rampEnabled: {
        swim: phase.rampSwimEnabled,
        bike: phase.rampBikeEnabled,
        run: phase.rampRunEnabled,
      },
      volumeTrend: volume.volumeTrend,
      volumeTargetPercent: volume.volumeTargetPercent,
      volumeTaperStartPercent: volume.volumeTaperStartPercent,
      volumeTaperEndPercent: volume.volumeTaperEndPercent,
    };
  });
}

function recalculateWeeks(
  weeks: Array<
    SimpleWeekVolume & {
      zoneMinutes: ZoneMinutes;
      zoneMinutesOverridden: boolean;
      volumeOverridden: boolean;
      longRideMinutes: number;
      longRunMinutes: number;
    }
  >,
  phaseSpans: SimplePhaseVolumeSpan[],
  zonePhaseSpans: ZonePhaseSpan[],
  rampDefaults: SimpleRampDefaults,
  deLoadStrategy: DeLoadStrategy,
  recoverySettings: RecoverySettings,
  suppressRecoveryWeeks: ReadonlySet<number> = new Set()
) {
  const shadowVolume = weeks.map((week) => ({
    ...week,
    isRestWeek: false,
    volumeOverridden: false,
  }));
  const rampedVolume = recalculateSimpleVolumes(shadowVolume, phaseSpans, rampDefaults);

  const volumeResult = weeks.map((week, weekIndex) => {
    if (week.volumeOverridden) {
      return {
        ...week,
        totalHours: roundHours(week.swimHours + week.bikeHours + week.runHours),
      };
    }

    if (week.isRestWeek) {
      if (suppressRecoveryWeeks.has(weekIndex)) {
        const ramped = rampedVolume[weekIndex]!;
        return {
          ...week,
          isRestWeek: false,
          swimHours: ramped.swimHours,
          bikeHours: ramped.bikeHours,
          runHours: ramped.runHours,
          totalHours: ramped.totalHours,
          swimDistanceMeters: ramped.swimDistanceMeters,
          runDistanceMeters: ramped.runDistanceMeters,
        };
      }

      const baseIndex = rampBaseWeekIndex(weeks, weekIndex);
      const baseline =
        baseIndex >= 0 ? rampedVolume[baseIndex]! : rampedVolume[weekIndex]!;
      const reduced = applyRecoveryVolumeHours(
        {
          swimHours: baseline.swimHours,
          bikeHours: baseline.bikeHours,
          runHours: baseline.runHours,
        },
        recoverySettings.volumePercent
      );
      return {
        ...week,
        ...reduced,
        swimDistanceMeters: week.swimDistanceMeters,
        runDistanceMeters: week.runDistanceMeters,
      };
    }

    const ramped = rampedVolume[weekIndex]!;
    return {
      ...week,
      swimHours: ramped.swimHours,
      bikeHours: ramped.bikeHours,
      runHours: ramped.runHours,
      totalHours: ramped.totalHours,
      swimDistanceMeters: ramped.swimDistanceMeters,
      runDistanceMeters: ramped.runDistanceMeters,
    };
  });

  const zoneInput = volumeResult.map((week) => ({
    weekIndex: week.weekIndex,
    isRestWeek: false,
    swimHours: week.swimHours,
    bikeHours: week.bikeHours,
    runHours: week.runHours,
  }));
  const rampedZones = recalculateZoneMinutesFromSplits(
    zoneInput,
    zonePhaseSpans,
    deLoadStrategy
  );

  const result = volumeResult.map((week, weekIndex) => {
    if (week.zoneMinutesOverridden) {
      return {
        ...week,
        zoneMinutes: clampZoneMinutesToVolume(toWeekWithZones(week)),
      };
    }

    if (week.isRestWeek && !suppressRecoveryWeeks.has(weekIndex)) {
      return {
        ...week,
        zoneMinutes: applyRecoveryZonesForWeek(
          rampedZones[weekIndex]!,
          week,
          recoverySettings
        ),
      };
    }

    return {
      ...week,
      zoneMinutes: rampedZones[weekIndex]!,
    };
  });

  syncDerivedDistanceOrHours(result, rampDefaults);
  for (const week of result) {
    week.totalHours = roundHours(week.swimHours + week.bikeHours + week.runHours);
  }
  return result;
}

export async function createSimpleSeasonPlan(input: CreateSimpleSeasonInput) {
  const bounds = buildSeasonDateBounds(input.startDate, input.endDate);
  const overlapping = await findOverlappingSeasonPlans(
    input.athleteId,
    bounds.startDate,
    bounds.endDate
  );

  if (overlapping.length === 1 && !overlapping[0]!.setupComplete) {
    return updateSimpleSeasonPlan(input.athleteId, overlapping[0]!.id, {
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      rampDefaults: input.rampDefaults,
      zoneRampDefaults: input.zoneRampDefaults,
      phaseKindZoneDefaults: input.phaseKindZoneDefaults,
      phases: [],
      recalculate: true,
      goalEvent: input.goalEvent,
      bGoalEvents: input.bGoalEvents,
      cGoalEvents: input.cGoalEvents,
    });
  }

  if (overlapping.length > 0) {
    throw new Error(formatSeasonOverlapError(overlapping));
  }

  const defaults = input.rampDefaults ?? defaultSimpleRampDefaults();
  const zoneDefaults = input.zoneRampDefaults ?? defaultZoneRampDefaults();
  const kindDefaults = input.phaseKindZoneDefaults ?? defaultPhaseKindZoneDefaults();
  const rampFields = rampDefaultsToPlanFields(defaults);
  const deLoadStrategy: DeLoadStrategy = "VOLUME_ONLY";
  const computedWeeks = buildInitialWeeks(
    bounds.totalWeeks,
    defaults,
    kindDefaults,
    deLoadStrategy
  );
  const status = deriveSeasonStatus(bounds.startDate, bounds.endDate);
  const seasonPlanId = cuid();

  await db.$transaction(async (tx) => {
    await tx.seasonPlan.create({
      data: {
        id: seasonPlanId,
        athleteId: input.athleteId,
        name: input.name,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        totalWeeks: bounds.totalWeeks,
        status,
        setupComplete: true,
        mesocycleLengthWeeks: 4,
        deLoadEveryNWeeks: 4,
        deLoadVolumePercent: 60,
        zoneRampDefaultsByDiscipline: zoneDefaults as Prisma.InputJsonValue,
        phaseKindZoneDefaults: serializePhaseKindZoneDefaults(
          kindDefaults
        ) as Prisma.InputJsonValue,
        ...rampFields,
      },
    });

    for (const week of computedWeeks) {
      await tx.seasonWeek.create({
        data: {
          id: cuid(),
          seasonPlanId,
          weekIndex: week.weekIndex,
          weekStartDate: weekStartDateForIndex(bounds.startDate, week.weekIndex),
          isDeLoadWeek: week.isRestWeek,
          totalHours: week.totalHours,
          swimHours: week.swimHours,
          bikeHours: week.bikeHours,
          runHours: week.runHours,
          swimDistanceMeters: week.swimDistanceMeters,
          runDistanceMeters: week.runDistanceMeters,
          zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
          zoneMinutesOverridden: week.zoneMinutesOverridden,
          volumeOverridden: week.volumeOverridden ?? false,
          swimSessions: 0,
          bikeSessions: 0,
          runSessions: 0,
          longRideMinutes: 0,
          longRunMinutes: 0,
        },
      });
    }

    if (input.goalEvent || input.bGoalEvents?.length || input.cGoalEvents?.length) {
      await createGoalEventsWithCalendar(tx, {
        athleteId: input.athleteId,
        seasonPlanId,
        primary: input.goalEvent,
        bGoalEvents: input.bGoalEvents,
        cGoalEvents: input.cGoalEvents,
      });
    }
  });

  return getSeasonPlanById(input.athleteId, seasonPlanId);
}

export async function updateSimpleSeasonPlan(
  athleteId: string,
  seasonPlanId: string,
  input: UpdateSimpleSeasonInput
) {
  const existing = await getSeasonPlanById(athleteId, seasonPlanId);
  if (!existing) {
    throw new Error("Season plan not found");
  }

  const startDate = input.startDate ?? calendarDateFromDb(existing.startDate);
  const endDate = input.endDate ?? calendarDateFromDb(existing.endDate);
  const bounds = buildSeasonDateBounds(startDate, endDate);
  await assertNoSeasonOverlap(athleteId, bounds.startDate, bounds.endDate, seasonPlanId);

  const defaults =
    input.rampDefaults ??
    resolveSimpleRampDefaults({
      startHours: existing.startHours,
      peakHours: existing.peakHours,
      maxRampPercent: existing.maxRampPercent,
      swimStartHours: existing.swimStartHours,
      swimPeakHours: existing.swimPeakHours,
      swimRampPercent: existing.swimRampPercent,
      bikeStartHours: existing.bikeStartHours,
      bikePeakHours: existing.bikePeakHours,
      bikeRampPercent: existing.bikeRampPercent,
      runStartHours: existing.runStartHours,
      runPeakHours: existing.runPeakHours,
      runRampPercent: existing.runRampPercent,
      swimSplitPercent: existing.swimSplitPercent,
      bikeSplitPercent: existing.bikeSplitPercent,
      runSplitPercent: existing.runSplitPercent,
      swimPlanningMode: existing.swimPlanningMode,
      runPlanningMode: existing.runPlanningMode,
      swimReferencePaceSeconds: existing.swimReferencePaceSeconds,
      runReferencePaceSeconds: existing.runReferencePaceSeconds,
      swimStartDistanceMeters: existing.swimStartDistanceMeters,
      swimPeakDistanceMeters: existing.swimPeakDistanceMeters,
      runStartDistanceMeters: existing.runStartDistanceMeters,
      runPeakDistanceMeters: existing.runPeakDistanceMeters,
    });

  const zoneDefaults =
    input.zoneRampDefaults ??
    parseZoneRampDefaults(existing.zoneRampDefaultsByDiscipline);

  const kindDefaults =
    input.phaseKindZoneDefaults ??
    parsePhaseKindZoneDefaults(
      (existing as { phaseKindZoneDefaults?: unknown }).phaseKindZoneDefaults
    );

  const deLoadStrategy = existing.deLoadStrategy ?? "VOLUME_ONLY";

  const rampFields = input.rampDefaults ? rampDefaultsToPlanFields(defaults) : undefined;

  const recoverySettings = resolveRecoverySettings({
    deLoadVolumePercent:
      input.recovery?.volumePercent ?? existing.deLoadVolumePercent,
    recoveryLoadWeeks: input.recovery?.loadWeeks ?? existing.recoveryLoadWeeks,
    recoveryZoneMode: input.recovery?.zoneMode ?? existing.recoveryZoneMode,
    recoveryHighZoneCutPercent:
      input.recovery?.highZoneCutPercent ?? existing.recoveryHighZoneCutPercent,
  });

  let phaseWrites = input.phases;
  if (phaseWrites) {
    phaseWrites = normalizePhasesToFullCoverage(
      phaseWrites.map(toSimplePhase),
      bounds.totalWeeks
    );
  }
  const phaseDbRows = phaseWrites ? phaseWritesToDb(phaseWrites) : null;
  const phaseSpans = phaseWrites
    ? phaseSpansFromWrites(phaseWrites)
    : buildPhaseVolumeSpansFromExisting(existing.phases);

  const zonePhaseSpans = phaseWrites
    ? zonePhaseSpansFromWrites(phaseWrites, kindDefaults)
    : zonePhaseSpansFromDb(existing.phases, kindDefaults);

  let weeks = mergeWeekWrites(
    weeksFromDb(existing.weeks),
    input.weeks,
    bounds.totalWeeks,
    defaults
  );

  if (input.resetZoneOverrides) {
    weeks = weeks.map((week) => ({ ...week, zoneMinutesOverridden: false }));
  }

  if (input.applyRecoveryCadence) {
    const skip = new Set(
      weeks
        .filter((week) => week.volumeOverridden || week.zoneMinutesOverridden)
        .map((week) => week.weekIndex)
    );
    const phaseSuppressWeeks = phaseWrites
      ? recoverySuppressedWeekIndices(
          phaseWrites.map((phase) => ({
            startWeekIndex: phase.startWeekIndex,
            endWeekIndex: phase.endWeekIndex,
            suppressRecovery: resolvePhaseVolumeSettings({
              volumeTrend: phase.volumeTrend,
              volumeTargetPercent: phase.volumeTargetPercent,
              volumeTaperStartPercent: phase.volumeTaperStartPercent,
              volumeTaperEndPercent: phase.volumeTaperEndPercent,
              longSessionCadence: phase.longSessionCadence,
              suppressRecovery: phase.suppressRecovery,
              name: phase.name,
            }).suppressRecovery,
          })),
          bounds.totalWeeks
        )
      : recoverySuppressedWeekIndices(
          existing.phases.map((phase) => {
            const notes = parsePhaseCoachNotes(phase.coachNotes);
            const volume = resolvePhaseVolumeSettings({
              volumeTrend:
                notes.volumeTrend ??
                volumeTrendFromDb(phase.volumeMesocycleMode, notes.isTaperVolume),
              volumeTargetPercent: notes.volumeTargetPercent,
              volumeTaperStartPercent: notes.volumeTaperStartPercent,
              volumeTaperEndPercent: notes.volumeTaperEndPercent,
              longSessionCadence: notes.longSessionCadence,
              suppressRecovery: notes.suppressRecovery,
              phaseKind: phase.phaseKind,
              name: phase.name,
            });
            const start = phase.startWeekIndex >= 0 ? phase.startWeekIndex : 0;
            return {
              startWeekIndex: start,
              endWeekIndex: start + Math.max(phase.weekCount, 1) - 1,
              suppressRecovery: volume.suppressRecovery,
            };
          }),
          bounds.totalWeeks
        );
    for (const weekIndex of phaseSuppressWeeks) skip.add(weekIndex);

    const suggested = suggestRecoveryWeeks(
      bounds.totalWeeks,
      recoverySettings.loadWeeks,
      skip
    );
    weeks = weeks.map((week) => ({
      ...week,
      isRestWeek: suggested[week.weekIndex] ?? false,
    }));
  }

  const suppressRecoveryWeeks = phaseWrites
    ? recoverySuppressedWeekIndices(
        phaseWrites.map((phase) => ({
          startWeekIndex: phase.startWeekIndex,
          endWeekIndex: phase.endWeekIndex,
          suppressRecovery: resolvePhaseVolumeSettings({
            volumeTrend: phase.volumeTrend,
            volumeTargetPercent: phase.volumeTargetPercent,
            volumeTaperStartPercent: phase.volumeTaperStartPercent,
            volumeTaperEndPercent: phase.volumeTaperEndPercent,
            longSessionCadence: phase.longSessionCadence,
            suppressRecovery: phase.suppressRecovery,
            name: phase.name,
          }).suppressRecovery,
        })),
        bounds.totalWeeks
      )
    : recoverySuppressedWeekIndices(
        existing.phases.map((phase) => {
          const notes = parsePhaseCoachNotes(phase.coachNotes);
          const volume = resolvePhaseVolumeSettings({
            volumeTrend:
              notes.volumeTrend ??
              volumeTrendFromDb(phase.volumeMesocycleMode, notes.isTaperVolume),
            volumeTargetPercent: notes.volumeTargetPercent,
            volumeTaperStartPercent: notes.volumeTaperStartPercent,
            volumeTaperEndPercent: notes.volumeTaperEndPercent,
            longSessionCadence: notes.longSessionCadence,
            suppressRecovery: notes.suppressRecovery,
            phaseKind: phase.phaseKind,
            name: phase.name,
          });
          const start = phase.startWeekIndex >= 0 ? phase.startWeekIndex : 0;
          return {
            startWeekIndex: start,
            endWeekIndex: start + Math.max(phase.weekCount, 1) - 1,
            suppressRecovery: volume.suppressRecovery,
          };
        }),
        bounds.totalWeeks
      );

  const longDefaults = resolveSimpleLongSessionDefaults({
    longRideStartMin: input.longSessionDefaults?.longRideStartMin ?? existing.longRideStartMin,
    longRidePeakMin: input.longSessionDefaults?.longRidePeakMin ?? existing.longRidePeakMin,
    longRunStartMin: input.longSessionDefaults?.longRunStartMin ?? existing.longRunStartMin,
    longRunPeakMin: input.longSessionDefaults?.longRunPeakMin ?? existing.longRunPeakMin,
  });

  if (input.recalculate) {
    weeks = recalculateWeeks(
      weeks,
      phaseSpans,
      zonePhaseSpans,
      defaults,
      deLoadStrategy,
      recoverySettings,
      suppressRecoveryWeeks
    );
    const phasesForLong = phaseWrites
      ? phaseWrites.map(toSimplePhase)
      : simplePhasesFromDb(existing.phases, bounds.totalWeeks);
    weeks = attachLongSessionsToWeeks(weeks, phasesForLong, longDefaults, defaults);
  }

  const status =
    existing.status === "ARCHIVED"
      ? "ARCHIVED"
      : deriveSeasonStatus(bounds.startDate, bounds.endDate);

  await db.$transaction(async (tx) => {
    if (phaseDbRows) {
      await tx.seasonPhaseDiscipline.deleteMany({
        where: { phase: { seasonPlanId } },
      });
      await tx.seasonMesocycle.deleteMany({
        where: { phase: { seasonPlanId } },
      });
      await tx.seasonPhase.deleteMany({ where: { seasonPlanId } });
    }

    await tx.seasonWeek.deleteMany({ where: { seasonPlanId } });

    await tx.seasonPlan.update({
      where: { id: seasonPlanId },
      data: {
        name: input.name ?? existing.name,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        totalWeeks: bounds.totalWeeks,
        status,
        setupComplete: true,
        ...(rampFields ?? {}),
        ...(input.zoneRampDefaults
          ? { zoneRampDefaultsByDiscipline: zoneDefaults as Prisma.InputJsonValue }
          : {}),
        ...(input.phaseKindZoneDefaults
          ? {
              phaseKindZoneDefaults: serializePhaseKindZoneDefaults(
                kindDefaults
              ) as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.recovery
          ? {
              deLoadVolumePercent: recoverySettings.volumePercent,
              recoveryLoadWeeks: recoverySettings.loadWeeks,
              recoveryZoneMode: recoverySettings.zoneMode,
              recoveryHighZoneCutPercent: recoverySettings.highZoneCutPercent,
              ...(input.recovery.sessionScalePercent !== undefined
                ? { deLoadCountScalePercent: input.recovery.sessionScalePercent }
                : {}),
            }
          : {}),
        ...(input.longSessionDefaults
          ? {
              longRideStartMin: longDefaults.longRideStartMin,
              longRidePeakMin: longDefaults.longRidePeakMin,
              longRunStartMin: longDefaults.longRunStartMin,
              longRunPeakMin: longDefaults.longRunPeakMin,
            }
          : {}),
      },
    });

    if (phaseDbRows) {
      for (const phase of phaseDbRows) {
        await tx.seasonPhase.create({
          data: {
            id: phase.id,
            seasonPlanId,
            name: phase.name,
            sortOrder: phase.sortOrder,
            weekCount: phase.weekCount,
            startWeekIndex: phase.startWeekIndex,
            phaseKind: phase.phaseKind,
            color: phase.color,
            coachNotes: phase.coachNotes,
            volumeMesocycleMode: phase.volumeMesocycleMode,
            rampSwimEnabled: phase.rampSwimEnabled,
            rampBikeEnabled: phase.rampBikeEnabled,
            rampRunEnabled: phase.rampRunEnabled,
            swimSessionsPerWeek: phase.swimSessionsPerWeek,
            bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
            runSessionsPerWeek: phase.runSessionsPerWeek,
          },
        });
      }
    }

    for (const week of weeks) {
      await tx.seasonWeek.create({
        data: {
          id: cuid(),
          seasonPlanId,
          weekIndex: week.weekIndex,
          weekStartDate: weekStartDateForIndex(bounds.startDate, week.weekIndex),
          isDeLoadWeek: week.isRestWeek,
          totalHours: week.totalHours,
          swimHours: week.swimHours,
          bikeHours: week.bikeHours,
          runHours: week.runHours,
          swimDistanceMeters: week.swimDistanceMeters,
          runDistanceMeters: week.runDistanceMeters,
          zoneMinutes: week.zoneMinutes as Prisma.InputJsonValue,
          zoneMinutesOverridden: week.zoneMinutesOverridden,
          volumeOverridden: week.volumeOverridden ?? false,
          swimSessions: 0,
          bikeSessions: 0,
          runSessions: 0,
          longRideMinutes: week.longRideMinutes,
          longRunMinutes: week.longRunMinutes,
        },
      });
    }

    if (input.goalEvent !== undefined) {
      await upsertPrimaryGoalEvent(tx, {
        athleteId,
        seasonPlanId,
        input: input.goalEvent,
        existingPrimaryId: existing.primaryGoalEventId,
      });
    }
    if (input.bGoalEvents !== undefined) {
      await syncGoalEventsByPriority(tx, {
        athleteId,
        seasonPlanId,
        priority: "B",
        inputs: input.bGoalEvents,
        existingIds: existing.goalEvents
          .filter((event) => event.priority === "B")
          .map((event) => event.id),
      });
    }
    if (input.cGoalEvents !== undefined) {
      await syncGoalEventsByPriority(tx, {
        athleteId,
        seasonPlanId,
        priority: "C",
        inputs: input.cGoalEvents,
        existingIds: existing.goalEvents
          .filter((event) => event.priority === "C")
          .map((event) => event.id),
      });
    }
    if (input.removedGoalEvents?.length) {
      await removeGoalEvents(tx, input.removedGoalEvents);
    }
    if (input.linkCalendarRaces?.length) {
      await linkCalendarRacesToPlan(tx, {
        athleteId,
        seasonPlanId,
        links: input.linkCalendarRaces,
      });
    }
  });

  return getSeasonPlanById(athleteId, seasonPlanId);
}

export async function serializeSimpleSeasonPlan(
  plan: NonNullable<Awaited<ReturnType<typeof getSeasonPlanById>>>
) {
  const startDate = calendarDateFromDb(plan.startDate);
  const endDate = calendarDateFromDb(plan.endDate);
  const unlinked = await findUnlinkedRaceSessions(plan.athleteId, startDate, endDate);
  const unlinkedRaceSessions = await Promise.all(
    unlinked.map(async (session) => {
      const siblings = session.multisportGroupId
        ? await db.plannedSession.findMany({
            where: { multisportGroupId: session.multisportGroupId },
            orderBy: { sessionIndex: "asc" },
          })
        : [];
      return serializeUnlinkedRaceSession(session, siblings);
    })
  );

  const defaults = resolveSimpleRampDefaults(plan);
  const zoneRampDefaults = parseZoneRampDefaults(plan.zoneRampDefaultsByDiscipline);
  const phaseKindZoneDefaults = parsePhaseKindZoneDefaults(
    (plan as { phaseKindZoneDefaults?: unknown }).phaseKindZoneDefaults
  );
  let cursor = 0;
  const phases = [...plan.phases]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((phase) => {
      const hasStoredStart = "startWeekIndex" in phase && phase.startWeekIndex >= 0;
      const assigned = phase.weekCount > 0;
      const startWeekIndex = assigned
        ? hasStoredStart
          ? phase.startWeekIndex
          : cursor
        : -1;
      const endWeekIndex = assigned ? startWeekIndex + phase.weekCount - 1 : -1;
      if (assigned && !hasStoredStart) {
        cursor += phase.weekCount;
      }
      const notes = parsePhaseCoachNotes(phase.coachNotes);
      const volume = resolvePhaseVolumeSettings({
        volumeTrend:
          notes.volumeTrend ??
          volumeTrendFromDb(phase.volumeMesocycleMode, notes.isTaperVolume),
        volumeTargetPercent: notes.volumeTargetPercent,
        volumeTaperStartPercent: notes.volumeTaperStartPercent,
        volumeTaperEndPercent: notes.volumeTaperEndPercent,
        longSessionCadence: notes.longSessionCadence,
        suppressRecovery: notes.suppressRecovery,
        phaseKind: phase.phaseKind,
        name: phase.name,
      });
      return {
        id: phase.id,
        name: phase.name,
        color: phase.color,
        phaseKind: phase.phaseKind,
        startWeekIndex,
        endWeekIndex,
        rampEnabled: {
          swim: phase.rampSwimEnabled,
          bike: phase.rampBikeEnabled,
          run: phase.rampRunEnabled,
        },
        swimSessionsPerWeek: phase.swimSessionsPerWeek,
        bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
        runSessionsPerWeek: phase.runSessionsPerWeek,
        strengthSessionsPerWeek: notes.strengthSessionsPerWeek,
        swimIntenseDaysPerWeek: notes.swimIntenseDaysPerWeek,
        bikeIntenseDaysPerWeek: notes.bikeIntenseDaysPerWeek,
        runIntenseDaysPerWeek: notes.runIntenseDaysPerWeek,
        goal: notes.goal,
        volumeTrend: volume.volumeTrend,
        volumeTargetPercent: volume.volumeTargetPercent,
        volumeTaperStartPercent: volume.volumeTaperStartPercent,
        volumeTaperEndPercent: volume.volumeTaperEndPercent,
        longSessionCadence: volume.longSessionCadence,
        suppressRecovery: volume.suppressRecovery,
        zoneSplits: notes.zoneSplits,
      };
    });

  const normalizedPhases = normalizePhasesToFullCoverage(phases, plan.totalWeeks);

  return {
    id: plan.id,
    name: plan.name,
    startDate: formatDateKey(plan.startDate),
    endDate: formatDateKey(plan.endDate),
    totalWeeks: plan.totalWeeks,
    status: plan.status,
    rampDefaults: defaults,
    zoneRampDefaults,
    phaseKindZoneDefaults,
    recovery: resolveRecoverySettings(plan),
    longSessionDefaults: resolveSimpleLongSessionDefaults(plan),
    unlinkedRaceSessions,
    phases: normalizedPhases,
    weeks: plan.weeks.map((week) => ({
      weekIndex: week.weekIndex,
      weekStartDate: formatDateKey(week.weekStartDate),
      isRestWeek: week.isDeLoadWeek,
      swimHours: week.swimHours,
      bikeHours: week.bikeHours,
      runHours: week.runHours,
      totalHours: week.totalHours,
      swimDistanceMeters: week.swimDistanceMeters,
      runDistanceMeters: week.runDistanceMeters,
      zoneMinutes: parseDisciplineZoneMinutes(week.zoneMinutes),
      zoneMinutesOverridden: week.zoneMinutesOverridden,
      volumeOverridden: week.volumeOverridden,
      longRideMinutes: week.longRideMinutes,
      longRunMinutes: week.longRunMinutes,
    })),
    goalEvents: plan.goalEvents.map((event) => ({
      ...serializeGoalEvent(event),
      priority: event.priority,
    })),
    primaryGoalEvent: plan.primaryGoalEvent
      ? {
          ...serializeGoalEvent(plan.primaryGoalEvent),
          priority: plan.primaryGoalEvent.priority,
        }
      : null,
  };
}

export type SimpleSeasonSummary = SeasonPlanSummary;

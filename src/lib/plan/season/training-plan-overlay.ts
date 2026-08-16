import type { Discipline, SessionRole } from "@prisma/client";
import { mondayWeekStartKey } from "@/lib/dates";
import type {
  DisciplineSlotBudget,
  PoolSlotKind,
  WeekSlotBudgets,
} from "@/lib/plan/season/simple-week-compute";
import {
  filterDroppedPlanSessions,
  type PlanSessionConflict,
  type ProgramDiscipline,
} from "@/lib/plan/season/plan-session-conflicts";
import { roundHours } from "@/lib/plan/season/volume-curve";
import type { ZoneSplitPercents } from "@/lib/plan/season/zone-split-types";
import {
  parseWorkoutTree,
  rollupTreeToZoneMinutes,
  totalTreeDurationMinutes,
  totalZoneMinutes,
  zoneKey,
  type ZoneMinutes,
} from "@/lib/workout/steps";

const TRI: Array<"SWIM" | "BIKE" | "RUN"> = ["SWIM", "BIKE", "RUN"];
const HOURS_KEY = {
  SWIM: "swimHours",
  BIKE: "bikeHours",
  RUN: "runHours",
} as const;

export type OverlayPlanSession = {
  scheduledDateKey: string;
  discipline: Discipline;
  sessionRole: SessionRole;
  estimatedDurationMinutes: number | null;
  steps?: unknown;
  attachmentId?: string;
  dayOffset?: number;
  sortOrder?: number;
  title?: string;
};

export type OverlayWeekTarget = {
  weekIndex: number;
  weekStartDate: string;
  isRestWeek?: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  strengthHours?: number;
  strengthSessions?: number;
  totalHours: number;
  zoneMinutes: ZoneMinutes;
  slotBudgets?: WeekSlotBudgets;
  ownedDisciplines?: ProgramDiscipline[];
  programSessionCounts?: Partial<Record<ProgramDiscipline, number>>;
  programIntenseCounts?: Partial<Record<ProgramDiscipline, number>>;
  programHasLongRide?: boolean;
  programHasLongRun?: boolean;
  hasPlanClash?: boolean;
};

export type OverlayZonePercentLookup = (
  weekIndex: number,
  discipline: "SWIM" | "BIKE" | "RUN"
) => ZoneSplitPercents | null;

export type AttachmentOwnership = {
  attachmentId: string;
  owns: ProgramDiscipline[] | null;
  fillLeftoverTiz?: Partial<Record<ProgramDiscipline, boolean>>;
};

export type OverlayPlanOptions = {
  zonePercentsForWeek?: OverlayZonePercentLookup;
  conflicts?: PlanSessionConflict[];
  ownership?: AttachmentOwnership[];
};

export function slotKindFromSessionRole(role: SessionRole): PoolSlotKind {
  if (role === "INTENSITY") return "INTENSITY";
  if (role === "LONG") return "LONG";
  return "ENDURANCE";
}

export function planSessionDurationMinutes(session: OverlayPlanSession): number {
  if (
    session.estimatedDurationMinutes != null &&
    session.estimatedDurationMinutes > 0
  ) {
    return session.estimatedDurationMinutes;
  }
  if (session.steps == null) return 0;
  try {
    const tree = parseWorkoutTree(session.steps);
    return totalTreeDurationMinutes(tree.nodes);
  } catch {
    return 0;
  }
}

/** Numeric-zone rollup from a workout tree, or null when the session is a skeleton. */
export function targetZonesForPlanSession(
  session: OverlayPlanSession
): ZoneMinutes | null {
  if (session.steps == null) return null;
  try {
    const rollup = rollupTreeToZoneMinutes(session.steps);
    return totalZoneMinutes(rollup) > 0 ? rollup : null;
  } catch {
    return null;
  }
}

function emptySlotBudget(): DisciplineSlotBudget {
  return {
    endurance: 0,
    intensity: 0,
    long: 0,
    substituteEndurance: 0,
    substituteDurationMinutes: 0,
  };
}

function emptySlotBudgets(): WeekSlotBudgets {
  return {
    SWIM: emptySlotBudget(),
    BIKE: emptySlotBudget(),
    RUN: emptySlotBudget(),
  };
}

function cloneSlotBudgets(budgets: WeekSlotBudgets): WeekSlotBudgets {
  return {
    SWIM: { ...budgets.SWIM },
    BIKE: { ...budgets.BIKE },
    RUN: { ...budgets.RUN },
  };
}

function incrementSlot(
  budgets: WeekSlotBudgets,
  discipline: "SWIM" | "BIKE" | "RUN",
  kind: PoolSlotKind
) {
  const row = budgets[discipline];
  if (kind === "INTENSITY") row.intensity += 1;
  else if (kind === "LONG") row.long += 1;
  else if (kind === "SUBSTITUTE_ENDURANCE") row.substituteEndurance += 1;
  else row.endurance += 1;
}

function slotTotal(row: DisciplineSlotBudget): number {
  return row.endurance + row.intensity + row.long + row.substituteEndurance;
}

function prefixedZoneMinutes(
  discipline: "SWIM" | "BIKE" | "RUN",
  numeric: ZoneMinutes
): ZoneMinutes {
  const out: ZoneMinutes = {};
  for (const [key, minutes] of Object.entries(numeric)) {
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    if (key.includes("-")) {
      out[key] = minutes;
      continue;
    }
    const zone = Number(key);
    if (!Number.isInteger(zone) || zone < 1) continue;
    out[zoneKey(discipline, zone)] = minutes;
  }
  return out;
}

function allocateDurationToZones(
  discipline: "SWIM" | "BIKE" | "RUN",
  minutes: number,
  percents: ZoneSplitPercents
): ZoneMinutes {
  const out: ZoneMinutes = {};
  const keys = [
    ["z1", 1],
    ["z2", 2],
    ["z3", 3],
    ["z4", 4],
    ["z5", 5],
  ] as const;
  for (const [pctKey, zone] of keys) {
    const value = Math.round((minutes * percents[pctKey]) / 100);
    if (value > 0) out[zoneKey(discipline, zone)] = value;
  }
  return out;
}

function replaceDisciplineZones(
  existing: ZoneMinutes,
  discipline: "SWIM" | "BIKE" | "RUN",
  next: ZoneMinutes
): ZoneMinutes {
  const out: ZoneMinutes = { ...existing };
  for (let z = 1; z <= 5; z++) {
    delete out[zoneKey(discipline, z)];
  }
  for (const [key, minutes] of Object.entries(next)) {
    if (minutes > 0) out[key] = minutes;
  }
  return out;
}

function mergeZones(base: ZoneMinutes, extra: ZoneMinutes): ZoneMinutes {
  const out: ZoneMinutes = { ...base };
  for (const [key, minutes] of Object.entries(extra)) {
    if (minutes > 0) out[key] = (out[key] ?? 0) + minutes;
  }
  return out;
}

type WeekPlanLoad = {
  hours: Record<ProgramDiscipline, number>;
  zones: Record<"SWIM" | "BIKE" | "RUN", ZoneMinutes>;
  slots: WeekSlotBudgets;
  sessionCounts: Record<ProgramDiscipline, number>;
  intenseCounts: Record<ProgramDiscipline, number>;
  hasLong: { BIKE: boolean; RUN: boolean };
  attachmentsByDiscipline: Record<ProgramDiscipline, Set<string>>;
};

function emptyWeekLoad(): WeekPlanLoad {
  return {
    hours: { SWIM: 0, BIKE: 0, RUN: 0, STRENGTH: 0 },
    zones: { SWIM: {}, BIKE: {}, RUN: {} },
    slots: emptySlotBudgets(),
    sessionCounts: { SWIM: 0, BIKE: 0, RUN: 0, STRENGTH: 0 },
    intenseCounts: { SWIM: 0, BIKE: 0, RUN: 0, STRENGTH: 0 },
    hasLong: { BIKE: false, RUN: false },
    attachmentsByDiscipline: {
      SWIM: new Set(),
      BIKE: new Set(),
      RUN: new Set(),
      STRENGTH: new Set(),
    },
  };
}

function asProgramDiscipline(value: Discipline): ProgramDiscipline | null {
  if (value === "SWIM" || value === "BIKE" || value === "RUN" || value === "STRENGTH") {
    return value;
  }
  return null;
}

function ownsDiscipline(
  ownership: AttachmentOwnership[] | undefined,
  attachmentId: string | undefined,
  discipline: ProgramDiscipline
): boolean {
  if (!attachmentId) return true;
  const row = ownership?.find((item) => item.attachmentId === attachmentId);
  if (!row || row.owns == null) return true;
  return row.owns.includes(discipline);
}

function fillLeftoverForDiscipline(
  ownership: AttachmentOwnership[] | undefined,
  attachmentIds: Set<string>,
  discipline: ProgramDiscipline
): boolean {
  if (!ownership || attachmentIds.size === 0) return false;
  for (const id of attachmentIds) {
    const row = ownership.find((item) => item.attachmentId === id);
    if (row?.fillLeftoverTiz?.[discipline]) return true;
  }
  return false;
}

function loadByWeek(
  sessions: OverlayPlanSession[],
  weekIndexByMonday: Map<string, number>,
  zonePercents?: OverlayZonePercentLookup,
  ownership?: AttachmentOwnership[]
): Map<number, WeekPlanLoad> {
  const byWeek = new Map<number, WeekPlanLoad>();

  for (const session of sessions) {
    const discipline = asProgramDiscipline(session.discipline);
    if (!discipline) continue;
    if (!ownsDiscipline(ownership, session.attachmentId, discipline)) continue;

    const monday = mondayWeekStartKey(session.scheduledDateKey);
    const weekIndex = weekIndexByMonday.get(monday);
    if (weekIndex == null) continue;

    const load = byWeek.get(weekIndex) ?? emptyWeekLoad();
    const minutes = planSessionDurationMinutes(session);
    load.hours[discipline] += minutes / 60;
    load.sessionCounts[discipline] += 1;
    if (session.sessionRole === "INTENSITY") load.intenseCounts[discipline] += 1;
    if (session.attachmentId) load.attachmentsByDiscipline[discipline].add(session.attachmentId);

    if (discipline === "BIKE" && session.sessionRole === "LONG") load.hasLong.BIKE = true;
    if (discipline === "RUN" && session.sessionRole === "LONG") load.hasLong.RUN = true;

    if (discipline !== "STRENGTH") {
      incrementSlot(load.slots, discipline, slotKindFromSessionRole(session.sessionRole));
      const treeZones = targetZonesForPlanSession(session);
      if (treeZones) {
        const prefixed = prefixedZoneMinutes(discipline, treeZones);
        for (const [key, value] of Object.entries(prefixed)) {
          load.zones[discipline][key] = (load.zones[discipline][key] ?? 0) + value;
        }
      } else if (minutes > 0 && zonePercents) {
        const percents = zonePercents(weekIndex, discipline);
        if (percents) {
          const allocated = allocateDurationToZones(discipline, minutes, percents);
          for (const [key, value] of Object.entries(allocated)) {
            load.zones[discipline][key] = (load.zones[discipline][key] ?? 0) + value;
          }
        }
      }
    }

    byWeek.set(weekIndex, load);
  }

  return byWeek;
}

/**
 * Drive owned-sport hours / TiZ / slot budgets from attached programs.
 * Unowned sports keep the season ramp. Paused weeks have no sessions and stay unchanged.
 */
export function overlayPlanLoadOnWeeks<T extends OverlayWeekTarget>(
  weeks: T[],
  sessions: OverlayPlanSession[],
  options?: OverlayPlanOptions
): T[] {
  const kept = filterDroppedPlanSessions(sessions, options?.conflicts ?? []);
  const weekIndexByMonday = new Map(
    weeks.map((week) => [mondayWeekStartKey(week.weekStartDate), week.weekIndex])
  );
  const loadByIndex = loadByWeek(
    kept,
    weekIndexByMonday,
    options?.zonePercentsForWeek,
    options?.ownership
  );

  return weeks.map((week) => {
    const load = loadByIndex.get(week.weekIndex);
    if (!load) {
      return {
        ...week,
        ownedDisciplines: [],
        programSessionCounts: {},
        programIntenseCounts: {},
        programHasLongRide: false,
        programHasLongRun: false,
      };
    }

    let swimHours = week.swimHours;
    let bikeHours = week.bikeHours;
    let runHours = week.runHours;
    let strengthHours = week.strengthHours ?? 0;
    let strengthSessions = week.strengthSessions ?? 0;
    let zoneMinutes = { ...week.zoneMinutes };
    let slotBudgets = week.slotBudgets
      ? cloneSlotBudgets(week.slotBudgets)
      : emptySlotBudgets();
    const owned: ProgramDiscipline[] = [];

    for (const discipline of TRI) {
      const planHours = roundHours(load.hours[discipline]);
      if (load.sessionCounts[discipline] <= 0) continue;
      owned.push(discipline);

      const fillLeftover = fillLeftoverForDiscipline(
        options?.ownership,
        load.attachmentsByDiscipline[discipline],
        discipline
      );
      const phaseHours = week[HOURS_KEY[discipline]];
      const leftoverHours = fillLeftover ? Math.max(0, phaseHours - planHours) : 0;
      const nextHours = roundHours(planHours + leftoverHours);
      if (discipline === "SWIM") swimHours = nextHours;
      if (discipline === "BIKE") bikeHours = nextHours;
      if (discipline === "RUN") runHours = nextHours;

      slotBudgets[discipline] = { ...load.slots[discipline] };
      const phaseSlotCount = week.slotBudgets ? slotTotal(week.slotBudgets[discipline]) : 0;
      const programSlotCount = slotTotal(load.slots[discipline]);
      const extraSlots =
        leftoverHours > 0 ? Math.max(0, phaseSlotCount - programSlotCount) : 0;
      if (extraSlots > 0) {
        slotBudgets[discipline].endurance += extraSlots;
      }

      const planZones = load.zones[discipline];
      if (totalZoneMinutes(planZones) > 0) {
        zoneMinutes = replaceDisciplineZones(zoneMinutes, discipline, planZones);
      }
      if (leftoverHours > 0 && options?.zonePercentsForWeek) {
        const percents = options.zonePercentsForWeek(week.weekIndex, discipline);
        if (percents) {
          const leftoverZones = allocateDurationToZones(
            discipline,
            leftoverHours * 60,
            percents
          );
          zoneMinutes = mergeZones(zoneMinutes, leftoverZones);
        }
      }
    }

    if (load.sessionCounts.STRENGTH > 0) {
      owned.push("STRENGTH");
      const planHours = roundHours(load.hours.STRENGTH);
      const fillLeftover = fillLeftoverForDiscipline(
        options?.ownership,
        load.attachmentsByDiscipline.STRENGTH,
        "STRENGTH"
      );
      const leftoverHours = fillLeftover
        ? Math.max(0, (week.strengthHours ?? 0) - planHours)
        : 0;
      strengthHours = roundHours(planHours + leftoverHours);
      const extraSessions =
        leftoverHours > 0
          ? Math.max(0, (week.strengthSessions ?? 0) - load.sessionCounts.STRENGTH)
          : 0;
      strengthSessions = load.sessionCounts.STRENGTH + extraSessions;
    }

    return {
      ...week,
      swimHours,
      bikeHours,
      runHours,
      strengthHours,
      strengthSessions,
      totalHours: roundHours(swimHours + bikeHours + runHours + strengthHours),
      zoneMinutes,
      slotBudgets,
      ownedDisciplines: owned,
      programSessionCounts: { ...load.sessionCounts },
      programIntenseCounts: { ...load.intenseCounts },
      programHasLongRide: load.hasLong.BIKE,
      programHasLongRun: load.hasLong.RUN,
    };
  });
}

export function overlaySessionsFromDetail(
  sessions: Array<{
    dayOffset: number;
    sortOrder: number;
    discipline: string;
    sessionRole: string;
    estimatedDurationMinutes: number | null;
    steps: unknown;
    title?: string;
  }>,
  scheduled: Array<{ dayOffset: number; sortOrder: number; scheduledDateKey: string }>,
  attachmentId?: string
): OverlayPlanSession[] {
  const byKey = new Map(
    sessions.map((s) => [`${s.dayOffset}:${s.sortOrder}`, s])
  );
  const out: OverlayPlanSession[] = [];
  for (const slot of scheduled) {
    const session = byKey.get(`${slot.dayOffset}:${slot.sortOrder}`);
    if (!session) continue;
    out.push({
      scheduledDateKey: slot.scheduledDateKey,
      discipline: session.discipline as OverlayPlanSession["discipline"],
      sessionRole: session.sessionRole as SessionRole,
      estimatedDurationMinutes: session.estimatedDurationMinutes,
      steps: session.steps,
      attachmentId,
      dayOffset: session.dayOffset,
      sortOrder: session.sortOrder,
      title: session.title,
    });
  }
  return out;
}

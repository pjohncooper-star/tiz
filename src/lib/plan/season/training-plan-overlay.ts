import type { Discipline, SessionRole } from "@prisma/client";
import { mondayWeekStartKey } from "@/lib/dates";
import type {
  DisciplineSlotBudget,
  PoolSlotKind,
  WeekSlotBudgets,
} from "@/lib/plan/season/simple-week-compute";
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
};

export type OverlayWeekTarget = {
  weekIndex: number;
  weekStartDate: string;
  isRestWeek?: boolean;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  totalHours: number;
  zoneMinutes: ZoneMinutes;
  slotBudgets?: WeekSlotBudgets;
};

export type OverlayZonePercentLookup = (
  weekIndex: number,
  discipline: "SWIM" | "BIKE" | "RUN"
) => ZoneSplitPercents | null;

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

function maxSlotBudgets(
  base: WeekSlotBudgets,
  plan: WeekSlotBudgets
): WeekSlotBudgets {
  const out = cloneSlotBudgets(base);
  for (const discipline of TRI) {
    const row = out[discipline];
    const add = plan[discipline];
    row.endurance = Math.max(row.endurance, add.endurance);
    row.intensity = Math.max(row.intensity, add.intensity);
    row.long = Math.max(row.long, add.long);
    row.substituteEndurance = Math.max(
      row.substituteEndurance,
      add.substituteEndurance
    );
    row.substituteDurationMinutes = Math.max(
      row.substituteDurationMinutes,
      add.substituteDurationMinutes
    );
  }
  return out;
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

type WeekPlanLoad = {
  hours: Record<"SWIM" | "BIKE" | "RUN", number>;
  zones: Record<"SWIM" | "BIKE" | "RUN", ZoneMinutes>;
  slots: WeekSlotBudgets;
};

function emptyWeekLoad(): WeekPlanLoad {
  return {
    hours: { SWIM: 0, BIKE: 0, RUN: 0 },
    zones: { SWIM: {}, BIKE: {}, RUN: {} },
    slots: emptySlotBudgets(),
  };
}

function loadByWeek(
  sessions: OverlayPlanSession[],
  weekIndexByMonday: Map<string, number>,
  zonePercents?: OverlayZonePercentLookup
): Map<number, WeekPlanLoad> {
  const byWeek = new Map<number, WeekPlanLoad>();

  for (const session of sessions) {
    if (session.discipline === "STRENGTH") continue;
    const discipline = session.discipline as "SWIM" | "BIKE" | "RUN";
    if (!TRI.includes(discipline)) continue;
    const monday = mondayWeekStartKey(session.scheduledDateKey);
    const weekIndex = weekIndexByMonday.get(monday);
    if (weekIndex == null) continue;

    const load = byWeek.get(weekIndex) ?? emptyWeekLoad();
    const minutes = planSessionDurationMinutes(session);
    load.hours[discipline] += minutes / 60;
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

    byWeek.set(weekIndex, load);
  }

  return byWeek;
}

/**
 * Raise week hours / TiZ / slot budgets so attached plan sessions are a floor.
 * Paused weeks have no plan sessions and are unchanged.
 */
export function overlayPlanLoadOnWeeks<T extends OverlayWeekTarget>(
  weeks: T[],
  sessions: OverlayPlanSession[],
  options?: { zonePercentsForWeek?: OverlayZonePercentLookup }
): T[] {
  const weekIndexByMonday = new Map(
    weeks.map((week) => [mondayWeekStartKey(week.weekStartDate), week.weekIndex])
  );
  const loadByIndex = loadByWeek(
    sessions,
    weekIndexByMonday,
    options?.zonePercentsForWeek
  );

  return weeks.map((week) => {
    const load = loadByIndex.get(week.weekIndex);
    if (!load) return week;

    let swimHours = week.swimHours;
    let bikeHours = week.bikeHours;
    let runHours = week.runHours;
    let zoneMinutes = { ...week.zoneMinutes };

    for (const discipline of TRI) {
      const planHours = roundHours(load.hours[discipline]);
      const currentHours = week[HOURS_KEY[discipline]];
      if (planHours > currentHours) {
        if (discipline === "SWIM") swimHours = planHours;
        if (discipline === "BIKE") bikeHours = planHours;
        if (discipline === "RUN") runHours = planHours;
        const planZones = load.zones[discipline];
        if (totalZoneMinutes(planZones) > 0) {
          zoneMinutes = replaceDisciplineZones(zoneMinutes, discipline, planZones);
        }
      }
    }

    const slotBudgets = week.slotBudgets
      ? maxSlotBudgets(week.slotBudgets, load.slots)
      : load.slots;

    return {
      ...week,
      swimHours,
      bikeHours,
      runHours,
      totalHours: roundHours(swimHours + bikeHours + runHours),
      zoneMinutes,
      slotBudgets,
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
  }>,
  scheduled: Array<{ dayOffset: number; sortOrder: number; scheduledDateKey: string }>
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
    });
  }
  return out;
}

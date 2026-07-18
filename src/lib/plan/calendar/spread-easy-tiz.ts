import type { Discipline } from "@prisma/client";
import type { CalendarWeekTarget, TargetDiscipline } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  bikeThresholdSpeedMps,
  flattenOptionsForDiscipline,
  type PaceThresholdContext,
} from "@/lib/plan/pace-threshold-context";
import { planningModeIncludesLongTiz } from "@/lib/plan/season/planning-mode";
import { derivePlannedMetricsFromPlanningSteps } from "@/lib/workout/planned-metrics-from-steps";
import { zoneKey } from "@/lib/workout/steps";
import { speedMpsAtZoneMidpoint } from "@/lib/workout/zone-pace";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import {
  draftFromNodes,
  treeFromDraft,
  type PoolCardDraft,
  type PoolCardDraftMap,
  type PoolCardDraftMetrics,
  type PoolDisciplineFilter,
} from "@/lib/plan/calendar/pool-session-card";
import type { PoolDiscipline, UnscheduledChip } from "@/lib/plan/calendar/unscheduled-chips";
import {
  flattenForPlanning,
  primarySignalForDiscipline,
  rollupTreeToZoneMinutes,
  type LeafStep,
  type WorkoutNode,
} from "@/lib/workout/workout-tree";

const ENDURANCE_SLOT_KINDS = new Set<UnscheduledChip["slotKind"]>([
  "ENDURANCE",
  "SUBSTITUTE_ENDURANCE",
]);

const LONG_WARM_COOL: Record<"BIKE" | "RUN", { warm: number; cool: number }> = {
  RUN: { warm: 10, cool: 5 },
  BIKE: { warm: 15, cool: 5 },
};

const TARGET_DISCIPLINES: TargetDiscipline[] = ["SWIM", "BIKE", "RUN"];

function enduranceDiscipline(
  discipline: PoolDiscipline
): discipline is TargetDiscipline {
  return discipline === "SWIM" || discipline === "BIKE" || discipline === "RUN";
}

function longDiscipline(discipline: PoolDiscipline): discipline is "BIKE" | "RUN" {
  return discipline === "BIKE" || discipline === "RUN";
}

function disciplineMatchesFilter(
  discipline: PoolDiscipline,
  filter: PoolDisciplineFilter
): boolean {
  if (filter === "ALL") return enduranceDiscipline(discipline);
  return discipline === filter;
}

function shouldExcludeLongFromMainBudget(
  weekTarget: CalendarWeekTarget,
  chip: Pick<UnscheduledChip, "slotKind" | "discipline">
): boolean {
  return (
    planningModeIncludesLongTiz(weekTarget.planningMode ?? "BY_DISCIPLINE") &&
    chip.slotKind === "LONG" &&
    longDiscipline(chip.discipline)
  );
}

function shouldExcludeLongSessionFromMainBudget(
  weekTarget: CalendarWeekTarget,
  session: CalendarPlannedSession
): boolean {
  return (
    planningModeIncludesLongTiz(weekTarget.planningMode ?? "BY_DISCIPLINE") &&
    session.sessionRole === "LONG" &&
    longDiscipline(session.discipline as PoolDiscipline)
  );
}

function splitMinutes(total: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const base = Math.floor(safeTotal / count);
  const remainder = safeTotal - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function zoneMinutesFromRollup(rollup: Record<string, number>, zone: number): number {
  return rollup[String(zone)] ?? 0;
}

function stepNode(
  intensity: LeafStep["intensity"],
  signal: LeafStep["target"]["signal"],
  zone: number,
  minutes: number
): LeafStep {
  return {
    kind: "step",
    intensity,
    duration: { type: "time", value: minutes * 60 },
    target: { signal, mode: "zone", zone },
  };
}

/** Z1 leaf then Z2 leaf; skips zero-length legs. */
export function buildEnduranceDraftNodes(
  discipline: TargetDiscipline,
  z1Min: number,
  z2Min: number
): WorkoutNode[] {
  const signal = primarySignalForDiscipline(discipline);
  const nodes: WorkoutNode[] = [];
  if (z1Min > 0) nodes.push(stepNode("active", signal, 1, z1Min));
  if (z2Min > 0) nodes.push(stepNode("active", signal, 2, z2Min));
  return nodes;
}

/** Warm Z1 / main Z2 / cool Z1; clamps warm then cool when total is short. */
export function buildLongDraftNodes(
  discipline: "BIKE" | "RUN",
  totalMinutes: number
): WorkoutNode[] {
  const signal = primarySignalForDiscipline(discipline);
  const { warm: warmDefault, cool: coolDefault } = LONG_WARM_COOL[discipline];
  const total = Math.max(0, Math.round(totalMinutes));

  let warm = warmDefault;
  let cool = coolDefault;
  let main = total - warm - cool;

  if (main < 0) {
    const excess = warm + cool - total;
    const warmShrink = Math.min(warm, excess);
    warm -= warmShrink;
    cool = Math.max(0, cool - (excess - warmShrink));
    main = Math.max(0, total - warm - cool);
  }

  const nodes: WorkoutNode[] = [];
  if (warm > 0) nodes.push(stepNode("warmup", signal, 1, warm));
  if (main > 0) nodes.push(stepNode("active", signal, 2, main));
  if (cool > 0) nodes.push(stepNode("cooldown", signal, 1, cool));
  return nodes;
}

function scheduledZoneMinutes(
  discipline: Discipline,
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[],
  zone: 1 | 2
): number {
  const key = zoneKey(discipline, zone);
  let done = 0;
  for (const session of sessions) {
    if (session.discipline !== discipline) continue;
    if (shouldExcludeLongSessionFromMainBudget(weekTarget, session)) continue;
    done += session.zoneMinutes[key] ?? 0;
  }
  return done;
}

function draftZoneMinutes(
  draft: PoolCardDraft,
  discipline: Discipline,
  paceContext: PaceThresholdContext | null | undefined
): Record<number, number> {
  const options = flattenOptionsForDiscipline(discipline, paceContext);
  const rollup = rollupTreeToZoneMinutes(treeFromDraft(draft), options);
  const out: Record<number, number> = {};
  for (const zone of [1, 2] as const) {
    out[zone] = zoneMinutesFromRollup(rollup, zone);
  }
  return out;
}

function remainingEasyZoneMinutes(
  discipline: TargetDiscipline,
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[],
  drafts: PoolCardDraftMap,
  chips: UnscheduledChip[],
  paceContext: PaceThresholdContext | null | undefined
): { z1: number; z2: number } {
  const z1Target = weekTarget.zoneMinutes[zoneKey(discipline, 1)] ?? 0;
  const z2Target = weekTarget.zoneMinutes[zoneKey(discipline, 2)] ?? 0;

  let z1Done = scheduledZoneMinutes(discipline, weekTarget, sessions, 1);
  let z2Done = scheduledZoneMinutes(discipline, weekTarget, sessions, 2);

  for (const chip of chips) {
    if (chip.discipline !== discipline) continue;
    const draft = drafts[chip.id];
    if (!draft) continue;
    if (shouldExcludeLongFromMainBudget(weekTarget, chip)) continue;
    const zones = draftZoneMinutes(draft, discipline, paceContext);
    z1Done += zones[1] ?? 0;
    z2Done += zones[2] ?? 0;
  }

  return {
    z1: Math.max(0, z1Target - z1Done),
    z2: Math.max(0, z2Target - z2Done),
  };
}

function deriveRunSwimMetrics(
  discipline: "RUN" | "SWIM",
  nodes: WorkoutNode[],
  paceContext: PaceThresholdContext | null | undefined
): PoolCardDraftMetrics {
  const ctx = paceContext?.[discipline];
  const steps = flattenForPlanning(nodes, flattenOptionsForDiscipline(discipline, paceContext));
  const metrics = derivePlannedMetricsFromPlanningSteps(discipline, steps, {
    thresholdPaceSeconds: ctx?.thresholdPaceSeconds ?? null,
    zoneBoundaries: ctx?.zoneBoundaries ?? zoneBoundariesFor(discipline, "PACE"),
  });
  return {
    ...(metrics.distanceMeters != null && metrics.distanceMeters > 0
      ? { distanceMeters: metrics.distanceMeters }
      : {}),
    ...(metrics.targetPaceSeconds != null && metrics.targetPaceSeconds > 0
      ? { targetPaceSeconds: metrics.targetPaceSeconds }
      : {}),
  };
}

function deriveBikeMetrics(
  nodes: WorkoutNode[],
  paceContext: PaceThresholdContext | null | undefined
): PoolCardDraftMetrics {
  const thresholdSpeedMps = bikeThresholdSpeedMps(paceContext);
  if (!thresholdSpeedMps) return {};

  const boundaries =
    paceContext?.BIKE?.zoneBoundaries ?? zoneBoundariesFor("BIKE", "PACE");
  const steps = flattenForPlanning(nodes);
  let totalDistance = 0;
  let speedWeighted = 0;
  let speedWeight = 0;

  for (const step of steps) {
    const durationSec =
      step.durationSeconds > 0
        ? step.durationSeconds
        : step.durationMinutes > 0
          ? step.durationMinutes * 60
          : 0;
    if (durationSec <= 0) continue;

    const speed =
      step.targetSpeedMps && step.targetSpeedMps > 0
        ? step.targetSpeedMps
        : step.targetZone >= 1
          ? speedMpsAtZoneMidpoint(step.targetZone, thresholdSpeedMps, boundaries)
          : 0;
    if (speed <= 0) continue;

    totalDistance += speed * durationSec;
    speedWeighted += speed * durationSec;
    speedWeight += durationSec;
  }

  if (!(totalDistance > 0) || !(speedWeight > 0)) return {};
  return {
    distanceMeters: totalDistance,
    targetSpeedMps: speedWeighted / speedWeight,
  };
}

function metricsForNodes(
  discipline: TargetDiscipline,
  nodes: WorkoutNode[],
  paceContext: PaceThresholdContext | null | undefined
): PoolCardDraftMetrics | undefined {
  if (discipline === "RUN" || discipline === "SWIM") {
    const metrics = deriveRunSwimMetrics(discipline, nodes, paceContext);
    return Object.keys(metrics).length > 0 ? metrics : undefined;
  }
  if (discipline === "BIKE") {
    const metrics = deriveBikeMetrics(nodes, paceContext);
    return Object.keys(metrics).length > 0 ? metrics : undefined;
  }
  return undefined;
}

function longMinutesForChip(
  chip: UnscheduledChip,
  weekTarget: CalendarWeekTarget
): number {
  if (chip.targetDurationMinutes != null && chip.targetDurationMinutes > 0) {
    return chip.targetDurationMinutes;
  }
  if (chip.discipline === "BIKE") return weekTarget.longRideMinutes ?? 0;
  if (chip.discipline === "RUN") return weekTarget.longRunMinutes ?? 0;
  return 0;
}

export type EasyTizSpreadInput = {
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
  drafts: PoolCardDraftMap;
  chips: UnscheduledChip[];
  disciplineFilter: PoolDisciplineFilter;
  paceContext?: PaceThresholdContext | null;
};

export function canAutoFillEasyTiz(input: {
  chips: UnscheduledChip[];
  drafts: PoolCardDraftMap;
  disciplineFilter: PoolDisciplineFilter;
}): boolean {
  return input.chips.some(
    (chip) =>
      disciplineMatchesFilter(chip.discipline, input.disciplineFilter) &&
      (ENDURANCE_SLOT_KINDS.has(chip.slotKind) || chip.slotKind === "LONG") &&
      !input.drafts[chip.id]
  );
}

export function computeEasyTizSpread(input: EasyTizSpreadInput): PoolCardDraftMap {
  const { weekTarget, sessions, drafts, chips, disciplineFilter, paceContext } = input;
  const generated: PoolCardDraftMap = {};

  for (const discipline of TARGET_DISCIPLINES) {
    if (!disciplineMatchesFilter(discipline, disciplineFilter)) continue;

    const enduranceCards = chips.filter(
      (chip) =>
        chip.discipline === discipline &&
        ENDURANCE_SLOT_KINDS.has(chip.slotKind) &&
        !drafts[chip.id] &&
        !generated[chip.id]
    );

    if (enduranceCards.length > 0) {
      const remaining = remainingEasyZoneMinutes(
        discipline,
        weekTarget,
        sessions,
        { ...drafts, ...generated },
        chips,
        paceContext
      );
      const z1Shares = splitMinutes(remaining.z1, enduranceCards.length);
      const z2Shares = splitMinutes(remaining.z2, enduranceCards.length);

      enduranceCards.forEach((chip, index) => {
        const nodes = buildEnduranceDraftNodes(
          discipline,
          z1Shares[index] ?? 0,
          z2Shares[index] ?? 0
        );
        if (nodes.length === 0) return;
        const draft = draftFromNodes(
          nodes,
          discipline,
          metricsForNodes(discipline, nodes, paceContext)
        );
        if (draft) generated[chip.id] = draft;
      });
    }

    if (!longDiscipline(discipline)) continue;

    const longCards = chips.filter(
      (chip) =>
        chip.discipline === discipline &&
        chip.slotKind === "LONG" &&
        !drafts[chip.id] &&
        !generated[chip.id]
    );

    for (const chip of longCards) {
      const totalMinutes = longMinutesForChip(chip, weekTarget);
      if (!(totalMinutes > 0)) continue;
      const nodes = buildLongDraftNodes(discipline, totalMinutes);
      if (nodes.length === 0) continue;
      const draft = draftFromNodes(
        nodes,
        discipline,
        metricsForNodes(discipline, nodes, paceContext)
      );
      if (draft) generated[chip.id] = draft;
    }
  }

  return generated;
}

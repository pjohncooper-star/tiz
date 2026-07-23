import type { Discipline } from "@prisma/client";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import {
  generatedPoolCardId,
  isFillableGeneratedSession,
  isStagingPoolCardId,
  poolSlotKindForSession,
} from "@/lib/plan/calendar/generated-pool-cards";
import {
  draftFromNodes,
  treeFromDraft,
  type PoolCardDraft,
  type PoolCardDraftMap,
} from "@/lib/plan/calendar/pool-session-card";
import type { PoolDiscipline, UnscheduledChip } from "@/lib/plan/calendar/unscheduled-chips";
import {
  flattenOptionsForDiscipline,
  type PaceThresholdContext,
} from "@/lib/plan/pace-threshold-context";
import { planningModeIncludesLongTiz } from "@/lib/plan/season/planning-mode";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";
import { rollupTreeToZoneMinutes, type WorkoutNode } from "@/lib/workout/workout-tree";

export type EffectiveScheduledTizRollup = {
  main: ZoneMinutes;
  long: ZoneMinutes;
};

export type EffectiveScheduledTizInput = {
  weekTarget: CalendarWeekTarget;
  sessions: CalendarPlannedSession[];
  drafts: PoolCardDraftMap;
  chips: UnscheduledChip[];
  paceContext?: PaceThresholdContext | null;
  /** Live composer graph for the armed card (before Done / Apply). */
  liveOverlay?: {
    cardId: string;
    nodes: WorkoutNode[];
    discipline: Discipline;
  } | null;
};

function longDiscipline(discipline: PoolDiscipline): discipline is "BIKE" | "RUN" {
  return discipline === "BIKE" || discipline === "RUN";
}

function separateLongTiz(weekTarget: CalendarWeekTarget): boolean {
  return planningModeIncludesLongTiz(weekTarget.planningMode ?? "BY_DISCIPLINE");
}

function shouldExcludeLongSessionFromMainBudget(
  weekTarget: CalendarWeekTarget,
  session: CalendarPlannedSession
): boolean {
  return (
    separateLongTiz(weekTarget) &&
    session.sessionRole === "LONG" &&
    longDiscipline(session.discipline as PoolDiscipline)
  );
}

function isLongBucketTarget(
  weekTarget: CalendarWeekTarget,
  slotKind: UnscheduledChip["slotKind"],
  discipline: PoolDiscipline
): boolean {
  return separateLongTiz(weekTarget) && slotKind === "LONG" && longDiscipline(discipline);
}

function mergeZoneMinutes(into: ZoneMinutes, add: ZoneMinutes): void {
  for (const [key, minutes] of Object.entries(add)) {
    if (minutes > 0) {
      into[key] = (into[key] ?? 0) + minutes;
    }
  }
}

/** Fold SWIM/BIKE/RUN-6+ keys into -5 so Week TiZ (Z1–Z5) does not drop minutes. */
function foldZoneMinutesForWeekTiz(zones: ZoneMinutes): ZoneMinutes {
  const out: ZoneMinutes = {};
  for (const [key, minutes] of Object.entries(zones)) {
    if (!(minutes > 0)) continue;
    const match = /^(SWIM|BIKE|RUN)-(\d+)$/.exec(key);
    if (!match) {
      out[key] = (out[key] ?? 0) + minutes;
      continue;
    }
    const zone = Math.min(Number(match[2]), 5);
    const folded = `${match[1]}-${zone}`;
    out[folded] = (out[folded] ?? 0) + minutes;
  }
  return out;
}

function draftZoneMinutesByKey(
  draft: PoolCardDraft,
  discipline: Discipline,
  paceContext: PaceThresholdContext | null | undefined
): ZoneMinutes {
  const options = flattenOptionsForDiscipline(discipline, paceContext);
  const rollup = rollupTreeToZoneMinutes(treeFromDraft(draft), options);
  const out: ZoneMinutes = {};
  // Fold Z6/Z7 into Z5 — Week TiZ only displays five zones.
  for (let zone = 1; zone <= 7; zone++) {
    const minutes = rollup[String(zone)] ?? 0;
    if (minutes > 0) {
      const displayZone = Math.min(zone, 5);
      const key = zoneKey(discipline, displayZone);
      out[key] = (out[key] ?? 0) + minutes;
    }
  }
  return out;
}

function draftFromLiveNodes(
  nodes: WorkoutNode[],
  discipline: Discipline
): PoolCardDraft | null {
  return draftFromNodes(nodes, discipline);
}

function effectiveDraftForCard(
  cardId: string,
  drafts: PoolCardDraftMap,
  liveOverlay: EffectiveScheduledTizInput["liveOverlay"]
): PoolCardDraft | null {
  if (liveOverlay?.cardId === cardId && liveOverlay.nodes.length > 0) {
    return draftFromLiveNodes(liveOverlay.nodes, liveOverlay.discipline);
  }
  return drafts[cardId] ?? null;
}

function addDraftContribution(
  rollup: EffectiveScheduledTizRollup,
  weekTarget: CalendarWeekTarget,
  discipline: Discipline,
  slotKind: UnscheduledChip["slotKind"],
  draft: PoolCardDraft,
  paceContext: PaceThresholdContext | null | undefined
): void {
  const zones = draftZoneMinutesByKey(draft, discipline, paceContext);
  const bucket = isLongBucketTarget(
    weekTarget,
    slotKind,
    discipline as PoolDiscipline
  )
    ? rollup.long
    : rollup.main;
  mergeZoneMinutes(bucket, zones);
}

function addSessionZoneContribution(
  rollup: EffectiveScheduledTizRollup,
  weekTarget: CalendarWeekTarget,
  session: CalendarPlannedSession,
  zones: ZoneMinutes
): void {
  if (shouldExcludeLongSessionFromMainBudget(weekTarget, session)) {
    mergeZoneMinutes(rollup.long, zones);
  } else {
    mergeZoneMinutes(rollup.main, zones);
  }
}

/** Persisted sessions + pool drafts + live composer overlay (excluding placeholder generated zones). */
export function computeEffectiveScheduledTiz(
  input: EffectiveScheduledTizInput
): EffectiveScheduledTizRollup {
  const { weekTarget, sessions, drafts, chips, paceContext, liveOverlay } = input;
  const rollup: EffectiveScheduledTizRollup = { main: {}, long: {} };

  for (const session of sessions) {
    if (isFillableGeneratedSession(session)) continue;

    const zones = foldZoneMinutesForWeekTiz(session.zoneMinutes);
    addSessionZoneContribution(rollup, weekTarget, session, zones);
  }

  for (const chip of chips) {
    if (isStagingPoolCardId(chip.id)) continue;
    const draft = effectiveDraftForCard(chip.id, drafts, liveOverlay);
    if (!draft) continue;
    addDraftContribution(rollup, weekTarget, chip.discipline, chip.slotKind, draft, paceContext);
  }

  for (const session of sessions) {
    if (!isFillableGeneratedSession(session)) continue;
    const cardId = generatedPoolCardId(session.id);
    const draft = effectiveDraftForCard(cardId, drafts, liveOverlay);
    if (draft) {
      addDraftContribution(
        rollup,
        weekTarget,
        session.discipline as Discipline,
        poolSlotKindForSession(session),
        draft,
        paceContext
      );
      continue;
    }
    // TEMPLATE long seats often have duration/targetZones but no structured workout.
    // Count stored zone minutes so Week TiZ includes the long ride/run.
    if (poolSlotKindForSession(session) !== "LONG") continue;
    const zones = foldZoneMinutesForWeekTiz(session.zoneMinutes);
    addSessionZoneContribution(rollup, weekTarget, session, zones);
  }

  return rollup;
}

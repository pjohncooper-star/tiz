import type { ActivityLegType, Discipline } from "@prisma/client";
import { formatDateKey } from "@/lib/dates";
import { ecoTransitionBump } from "@/lib/eco/compute";
import type { EcoImpulse } from "@/lib/eco/fitness-fatigue";
import { projectedEcosFromPlannedTiZ } from "@/lib/eco/tiz-to-eco";

export type PlannedSessionForEco = {
  id: string;
  scheduledDate: Date;
  discipline: Discipline;
  targetZones?: unknown;
  durationMinutes?: number | null;
  zoneAllocationMissing?: boolean;
  structuredSteps?: unknown;
  multisportGroupId?: string | null;
  sessionIndex?: number | null;
  /** True when a linked completed activity already contributes scored ECO. */
  linkedActivityHasEcos?: boolean;
};

function impulseAtDateKey(dateKey: string, discipline: string, ecos: number): EcoImpulse {
  return {
    startTime: new Date(`${dateKey}T12:00:00.000Z`),
    utcOffsetSeconds: 0,
    discipline,
    ecos,
  };
}

function enduranceLeg(discipline: Discipline): ActivityLegType | null {
  if (discipline === "SWIM" || discipline === "BIKE" || discipline === "RUN") {
    return discipline;
  }
  return null;
}

/**
 * Build projected ECO impulses from planned sessions for today (if not already
 * covered by actuals) and all future days. Past planned sessions are omitted —
 * history should come from scored activities.
 */
export function plannedEcoImpulses(options: {
  sessions: PlannedSessionForEco[];
  todayKey: string;
}): EcoImpulse[] {
  const { sessions, todayKey } = options;

  const byGroup = new Map<string, PlannedSessionForEco[]>();
  for (const session of sessions) {
    if (!session.multisportGroupId) continue;
    const list = byGroup.get(session.multisportGroupId) ?? [];
    list.push(session);
    byGroup.set(session.multisportGroupId, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
  }

  const impulses: EcoImpulse[] = [];

  for (const session of sessions) {
    const dateKey = formatDateKey(session.scheduledDate);
    if (dateKey < todayKey) continue;
    if (dateKey === todayKey && session.linkedActivityHasEcos) continue;

    let transitionBump = 0;
    if (session.multisportGroupId) {
      const group = byGroup.get(session.multisportGroupId) ?? [];
      const idx = group.findIndex((s) => s.id === session.id);
      const prior = group.slice(0, Math.max(0, idx));
      const priorLegTypes = prior
        .map((s) => enduranceLeg(s.discipline))
        .filter((t): t is ActivityLegType => t != null);
      transitionBump = ecoTransitionBump({
        discipline: session.discipline,
        legType: enduranceLeg(session.discipline) ?? undefined,
        priorLegTypes,
      });
    }

    const projected = projectedEcosFromPlannedTiZ({
      discipline: session.discipline,
      targetZones: session.targetZones,
      structuredSteps: session.structuredSteps,
      durationHintMinutes: session.durationMinutes,
      zoneAllocationMissing: session.zoneAllocationMissing,
      transitionBump,
    });
    if (!projected) continue;

    impulses.push(impulseAtDateKey(dateKey, session.discipline, projected.ecos));
  }

  return impulses;
}

/** Merge scored history with planned projection impulses. */
export function mergeHistoryAndPlanImpulses(
  history: EcoImpulse[],
  planned: EcoImpulse[]
): EcoImpulse[] {
  return [...history, ...planned];
}

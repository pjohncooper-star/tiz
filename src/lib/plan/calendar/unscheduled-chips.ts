import type { TargetDiscipline } from "@/components/calendar/types";
import type { CalendarWeekTarget, CalendarWeekTargetDiscipline } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import type { PoolSlotKind, WeekSlotBudgets } from "@/lib/plan/season/simple-week-compute";

export type PoolDiscipline = TargetDiscipline | "STRENGTH";

export type UnscheduledChip = {
  /** Stable drag id, e.g. `unscheduled-SWIM-0`. */
  id: string;
  discipline: PoolDiscipline;
  label: string;
  slotKind: PoolSlotKind;
  /** Target duration for long / substitute slots (minutes). */
  targetDurationMinutes?: number;
};

const TARGET_DISCIPLINES: TargetDiscipline[] = ["SWIM", "BIKE", "RUN"];

const SLOT_KIND_LABEL: Record<PoolSlotKind, string> = {
  ENDURANCE: "Endurance",
  INTENSITY: "Intense",
  LONG: "Long",
  SUBSTITUTE_ENDURANCE: "Endurance",
};

export function formatChipDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatUnscheduledChipLabel(
  discipline: PoolDiscipline,
  slotKind: PoolSlotKind,
  targetDurationMinutes?: number
): string {
  const baseLabel = DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline;
  const kindLabel = SLOT_KIND_LABEL[slotKind];
  const parts = [baseLabel, kindLabel];
  if (slotKind === "SUBSTITUTE_ENDURANCE") {
    parts[1] = "Endurance (sub)";
  }
  if (
    targetDurationMinutes != null &&
    targetDurationMinutes > 0 &&
    (slotKind === "LONG" || slotKind === "SUBSTITUTE_ENDURANCE")
  ) {
    parts.push(formatChipDurationMinutes(targetDurationMinutes));
  }
  return parts.join(" · ");
}

/** Count scheduled training sessions per discipline and slot kind (races excluded). */
export function countScheduledSlotsByDiscipline(
  sessions: CalendarPlannedSession[]
): Map<PoolDiscipline, Map<PoolSlotKind, number>> {
  const counts = new Map<PoolDiscipline, Map<PoolSlotKind, number>>();
  for (const discipline of [...TARGET_DISCIPLINES, "STRENGTH" as const]) {
    counts.set(
      discipline,
      new Map([
        ["ENDURANCE", 0],
        ["INTENSITY", 0],
        ["LONG", 0],
        ["SUBSTITUTE_ENDURANCE", 0],
      ])
    );
  }

  for (const session of sessions) {
    if (session.source === "RACE") continue;
    const discipline = session.discipline as PoolDiscipline;
    const row = counts.get(discipline);
    if (!row) continue;

    let kind: PoolSlotKind = "ENDURANCE";
    if (session.poolSlotKind) {
      kind = session.poolSlotKind;
    } else if (session.sessionRole === "INTENSITY") {
      kind = "INTENSITY";
    } else if (session.sessionRole === "LONG") {
      kind = "LONG";
    } else if (session.sessionRole === "EASY" || session.sessionRole === "MODERATE") {
      kind = "ENDURANCE";
    }

    row.set(kind, (row.get(kind) ?? 0) + 1);
  }

  return counts;
}

/** @deprecated use countScheduledSlotsByDiscipline */
export function countScheduledSessionsByDiscipline(
  sessions: CalendarPlannedSession[]
): Map<PoolDiscipline, number> {
  const counts = new Map<PoolDiscipline, number>();
  for (const discipline of [...TARGET_DISCIPLINES, "STRENGTH" as const]) {
    counts.set(discipline, 0);
  }
  for (const session of sessions) {
    if (session.source === "RACE") continue;
    const discipline = session.discipline as PoolDiscipline;
    if (!counts.has(discipline)) continue;
    counts.set(discipline, (counts.get(discipline) ?? 0) + 1);
  }
  return counts;
}

function slotBudgetForDiscipline(
  weekTarget: CalendarWeekTarget,
  discipline: PoolDiscipline
): WeekSlotBudgets[TargetDiscipline] | null {
  if (discipline === "STRENGTH") return null;
  return weekTarget.slotBudgets?.[discipline] ?? null;
}

function legacySessionBudget(
  weekTarget: CalendarWeekTarget,
  discipline: PoolDiscipline
): number {
  if (discipline === "STRENGTH") {
    return Math.max(0, Math.round(weekTarget.strengthSessionsPerWeek));
  }
  const entry = weekTarget.byDiscipline.find((row) => row.discipline === discipline);
  return Math.max(0, Math.round(entry?.sessionsPerWeek ?? 0));
}

function emitChips(
  chips: UnscheduledChip[],
  weekStart: string,
  discipline: PoolDiscipline,
  slotKind: PoolSlotKind,
  count: number,
  targetDurationMinutes?: number
) {
  const label = formatUnscheduledChipLabel(
    discipline,
    slotKind,
    targetDurationMinutes
  );
  for (let i = 0; i < count; i++) {
    chips.push({
      id: `unscheduled-${weekStart}-${discipline}-${slotKind}-${i}`,
      discipline,
      slotKind,
      label,
      ...(targetDurationMinutes != null && targetDurationMinutes > 0
        ? { targetDurationMinutes }
        : {}),
    });
  }
}

/**
 * Derive typed unscheduled chips from season slot budgets minus scheduled sessions.
 */
export function computeUnscheduledChips(
  weekStart: string,
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[]
): UnscheduledChip[] {
  const scheduled = countScheduledSlotsByDiscipline(sessions);
  const chips: UnscheduledChip[] = [];

  for (const discipline of [...TARGET_DISCIPLINES, "STRENGTH" as const]) {
    if (discipline === "STRENGTH") {
      const budget = legacySessionBudget(weekTarget, discipline);
      const placed = [...scheduled.get("STRENGTH")!.values()].reduce((a, b) => a + b, 0);
      const remaining = Math.max(0, budget - placed);
      emitChips(chips, weekStart, discipline, "ENDURANCE", remaining);
      continue;
    }

    const budget = slotBudgetForDiscipline(weekTarget, discipline);
    const placedMap = scheduled.get(discipline)!;

    if (!budget) {
      const legacyBudget = legacySessionBudget(weekTarget, discipline);
      const placed = [...placedMap.values()].reduce((a, b) => a + b, 0);
      const remaining = Math.max(0, legacyBudget - placed);
      emitChips(chips, weekStart, discipline, "ENDURANCE", remaining);
      continue;
    }

    const enduranceRemaining = Math.max(
      0,
      budget.endurance - (placedMap.get("ENDURANCE") ?? 0)
    );
    const intensityRemaining = Math.max(
      0,
      budget.intensity - (placedMap.get("INTENSITY") ?? 0)
    );
    const longRemaining = Math.max(0, budget.long - (placedMap.get("LONG") ?? 0));
    const subRemaining = Math.max(
      0,
      budget.substituteEndurance - (placedMap.get("SUBSTITUTE_ENDURANCE") ?? 0)
    );

    emitChips(chips, weekStart, discipline, "ENDURANCE", enduranceRemaining);
    emitChips(chips, weekStart, discipline, "INTENSITY", intensityRemaining);
    if (discipline === "BIKE") {
      emitChips(
        chips,
        weekStart,
        discipline,
        "LONG",
        longRemaining,
        weekTarget.longRideMinutes
      );
    } else if (discipline === "RUN") {
      emitChips(
        chips,
        weekStart,
        discipline,
        "LONG",
        longRemaining,
        weekTarget.longRunMinutes
      );
    } else {
      emitChips(chips, weekStart, discipline, "LONG", longRemaining);
    }
    emitChips(
      chips,
      weekStart,
      discipline,
      "SUBSTITUTE_ENDURANCE",
      subRemaining,
      budget.substituteDurationMinutes
    );
  }

  return chips;
}

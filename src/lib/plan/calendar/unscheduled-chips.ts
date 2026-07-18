import type { TargetDiscipline } from "@/components/calendar/types";
import type { CalendarWeekTarget, CalendarWeekTargetDiscipline } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import type { PoolSlotKind, WeekSlotBudgets } from "@/lib/plan/season/simple-week-compute";

export type DisciplineSlotBudget = WeekSlotBudgets[TargetDiscipline];

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

function disciplineSlotBudgetTotal(budget: DisciplineSlotBudget): number {
  return (
    budget.endurance +
    budget.intensity +
    budget.long +
    budget.substituteEndurance
  );
}

/** True when typed slot budgets exist and at least one tri slot is budgeted. */
export function hasUsableTypedSlotBudgets(weekTarget: CalendarWeekTarget): boolean {
  if (!weekTarget.slotBudgets) return false;
  for (const discipline of TARGET_DISCIPLINES) {
    if (disciplineSlotBudgetTotal(weekTarget.slotBudgets[discipline]) > 0) {
      return true;
    }
  }
  return false;
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
    const legacyBudget = legacySessionBudget(weekTarget, discipline);

    if (
      !budget ||
      (disciplineSlotBudgetTotal(budget) === 0 && legacyBudget > 0)
    ) {
      const placed = [...placedMap.values()].reduce((a, b) => a + b, 0);
      const remaining = Math.max(0, legacyBudget - placed);
      emitChips(chips, weekStart, discipline, "ENDURANCE", remaining);
      continue;
    }

    const placedMapTyped = placedMap;

    const enduranceRemaining = Math.max(
      0,
      budget.endurance - (placedMapTyped.get("ENDURANCE") ?? 0)
    );
    const intensityRemaining = Math.max(
      0,
      budget.intensity - (placedMapTyped.get("INTENSITY") ?? 0)
    );
    const longRemaining = Math.max(
      0,
      budget.long - (placedMapTyped.get("LONG") ?? 0)
    );
    const subRemaining = Math.max(
      0,
      budget.substituteEndurance - (placedMapTyped.get("SUBSTITUTE_ENDURANCE") ?? 0)
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

/** True when the week has at least one unscheduled pool chip. */
export function weekHasUnplannedPoolSessions(
  weekStart: string,
  weekTarget: CalendarWeekTarget | null | undefined,
  sessions: CalendarPlannedSession[]
): boolean {
  if (!weekTarget) return false;
  return computeUnscheduledChips(weekStart, weekTarget, sessions).length > 0;
}

/**
 * First week after `fromWeekStart` (exclusive) in `sortedWeekStarts` with unplanned pool sessions.
 */
export function findNextUnplannedWeekStart(
  fromWeekStart: string,
  sortedWeekStarts: string[],
  weekHasUnplanned: (weekStart: string) => boolean
): string | null {
  for (const weekStart of sortedWeekStarts) {
    if (weekStart <= fromWeekStart) continue;
    if (weekHasUnplanned(weekStart)) return weekStart;
  }
  return null;
}

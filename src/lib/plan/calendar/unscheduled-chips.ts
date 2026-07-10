import type { CalendarWeekTarget, TargetDiscipline } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";

export type PoolDiscipline = TargetDiscipline | "STRENGTH";

export type UnscheduledChip = {
  /** Stable drag id, e.g. `unscheduled-SWIM-0`. */
  id: string;
  discipline: PoolDiscipline;
  label: string;
};

const TARGET_DISCIPLINES: TargetDiscipline[] = ["SWIM", "BIKE", "RUN"];

/** Count scheduled training sessions per discipline (races excluded). */
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

function sessionBudgetForDiscipline(
  weekTarget: CalendarWeekTarget,
  discipline: PoolDiscipline
): number {
  if (discipline === "STRENGTH") {
    return Math.max(0, Math.round(weekTarget.strengthSessionsPerWeek));
  }
  const entry = weekTarget.byDiscipline.find((row) => row.discipline === discipline);
  return Math.max(0, Math.round(entry?.sessionsPerWeek ?? 0));
}

/**
 * Derive generic unscheduled chips from season session budget minus scheduled
 * `PlannedSession` rows for the week. Each chip represents one session still
 * to place on the calendar grid.
 */
export function computeUnscheduledChips(
  weekStart: string,
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[]
): UnscheduledChip[] {
  const scheduled = countScheduledSessionsByDiscipline(sessions);
  const chips: UnscheduledChip[] = [];

  for (const discipline of [...TARGET_DISCIPLINES, "STRENGTH" as const]) {
    const budget = sessionBudgetForDiscipline(weekTarget, discipline);
    const placed = scheduled.get(discipline) ?? 0;
    const remaining = Math.max(0, budget - placed);
    const label = DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline;

    for (let i = 0; i < remaining; i++) {
      chips.push({
        id: `unscheduled-${weekStart}-${discipline}-${i}`,
        discipline,
        label,
      });
    }
  }

  return chips;
}

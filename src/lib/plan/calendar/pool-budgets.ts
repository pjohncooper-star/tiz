import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { summarizeWeekPlannedSessions } from "@/lib/plan/calendar/week-summary";
import type { DisciplineBudget } from "@/lib/plan/calendar/generate-workouts";

const HARD_ZONES = [3, 4, 5] as const;

/** Remaining hard-zone (Z3–Z5) minutes per discipline for suggested workout cards. */
export function computeHardZoneBudgets(
  weekTarget: CalendarWeekTarget,
  sessions: CalendarPlannedSession[]
): DisciplineBudget[] {
  const planned = summarizeWeekPlannedSessions(sessions);
  return weekTarget.byDiscipline.map((entry) => {
    const plannedRow = planned.bySport.find((row) => row.discipline === entry.discipline);
    const remainingByZone: Record<number, number> = {};
    for (const zone of HARD_ZONES) {
      const key = `${entry.discipline}-${zone}`;
      const target = entry.zoneMinutes[key] ?? 0;
      const done = plannedRow?.zoneMinutes[key] ?? 0;
      remainingByZone[zone] = Math.max(0, Math.round((target - done) * 10) / 10);
    }
    return {
      discipline: entry.discipline,
      intenseDaysPerWeek: entry.intenseDaysPerWeek,
      remainingByZone,
    };
  });
}

export function hasHardZoneBudget(budgets: DisciplineBudget[]): boolean {
  return budgets.some((budget) =>
    HARD_ZONES.some((zone) => (budget.remainingByZone[zone] ?? 0) > 0.5)
  );
}

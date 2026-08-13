import {
  addDaysToDateKey,
  mondayWeekStartKey,
} from "@/lib/dates";
import type { SimpleTrainingPlanAttachment, SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import {
  overlayPlanLoadOnWeeks,
  overlaySessionsFromDetail,
} from "@/lib/plan/season/training-plan-overlay";
import {
  resolveApplyWindowWithPauses,
  schedulePlanSessionsWithPauses,
  type ApplyWindowWithPausesResult,
} from "@/lib/plan/training-plan";

export type AttachedPlanSessionDraft = {
  dayOffset: number;
  sortOrder: number;
  discipline: string;
  sessionRole: string;
  estimatedDurationMinutes: number | null;
  steps: unknown;
};

export function previewAttachedPlanWeeks<T extends SimpleWeek>(
  weeks: T[],
  attachment: SimpleTrainingPlanAttachment,
  sessions: AttachedPlanSessionDraft[],
  todayKey: string
): { weeks: T[]; window: ApplyWindowWithPausesResult | null } {
  try {
    const window = resolveApplyWindowWithPauses({
      durationDays: attachment.durationDays,
      anchorMode: attachment.anchorMode,
      date: attachment.anchorDate,
      todayKey,
      pausedWeeks: attachment.pausedWeeks,
    });
    const scheduled = schedulePlanSessionsWithPauses(
      sessions,
      window,
      window.pausedMondays
    );
    const overlaySessions = overlaySessionsFromDetail(sessions, scheduled);
    const paused = new Set(window.pausedMondays);
    const overlaid = overlayPlanLoadOnWeeks(weeks, overlaySessions);
    return {
      window,
      weeks: overlaid.map((week) => {
        const monday = mondayWeekStartKey(week.weekStartDate);
        const weekEnd = addDaysToDateKey(monday, 6);
        const overlaps =
          monday <= window.endDate && weekEnd >= window.startDate;
        return {
          ...week,
          planCoverage: !overlaps
            ? null
            : paused.has(monday)
              ? "paused"
              : "attached",
        };
      }),
    };
  } catch {
    return { weeks, window: null };
  }
}

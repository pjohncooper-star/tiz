import {
  addDaysToDateKey,
  mondayWeekStartKey,
} from "@/lib/dates";
import type { SimpleTrainingPlanAttachment, SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import {
  detectPlanSessionClashes,
  parseFillLeftoverTiz,
  parseOwnsDisciplines,
  type PlanSessionClash,
  type PlanSessionConflict,
} from "@/lib/plan/season/plan-session-conflicts";
import {
  overlayPlanLoadOnWeeks,
  overlaySessionsFromDetail,
  type OverlayPlanSession,
} from "@/lib/plan/season/training-plan-overlay";
import {
  resolveApplyWindowWithPauses,
  schedulePlanSessionsWithPauses,
  seasonExtensionForWindow,
  type ApplyWindowWithPausesResult,
  type SeasonDateExtension,
} from "@/lib/plan/training-plan";

export type AttachedPlanSessionDraft = {
  dayOffset: number;
  sortOrder: number;
  discipline: string;
  sessionRole: string;
  estimatedDurationMinutes: number | null;
  steps: unknown;
  title?: string;
};

export type AttachmentWindowPreview = {
  attachmentId: string;
  window: ApplyWindowWithPausesResult;
  extension: SeasonDateExtension | null;
};

export type PreviewAttachedProgramsResult<T extends SimpleWeek> = {
  weeks: T[];
  windows: AttachmentWindowPreview[];
  clashes: PlanSessionClash[];
  overlaySessions: OverlayPlanSession[];
};

function coverageForWeek(
  weekStartDate: string,
  windows: AttachmentWindowPreview[]
): NonNullable<SimpleWeek["planCoverages"]> {
  const monday = mondayWeekStartKey(weekStartDate);
  const weekEnd = addDaysToDateKey(monday, 6);
  const coverages: NonNullable<SimpleWeek["planCoverages"]> = [];
  for (const row of windows) {
    const overlaps = monday <= row.window.endDate && weekEnd >= row.window.startDate;
    if (!overlaps) continue;
    coverages.push({
      attachmentId: row.attachmentId,
      coverage: row.window.pausedMondays.includes(monday) ? "paused" : "attached",
    });
  }
  return coverages;
}

export function previewAttachedPrograms<T extends SimpleWeek>(
  weeks: T[],
  attachments: SimpleTrainingPlanAttachment[],
  sessionsByPlanId: Record<string, AttachedPlanSessionDraft[]>,
  todayKey: string,
  options?: {
    conflicts?: PlanSessionConflict[];
    seasonStart?: string;
    seasonEnd?: string;
  }
): PreviewAttachedProgramsResult<T> {
  const overlaySessions: OverlayPlanSession[] = [];
  const windows: AttachmentWindowPreview[] = [];

  for (const attachment of attachments) {
    const attachmentId = attachment.id ?? attachment.trainingPlanId;
    const sessions = sessionsByPlanId[attachment.trainingPlanId] ?? [];
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
      const overlay = overlaySessionsFromDetail(sessions, scheduled, attachmentId);
      overlaySessions.push(...overlay);
      windows.push({
        attachmentId,
        window,
        extension:
          options?.seasonStart && options?.seasonEnd
            ? seasonExtensionForWindow(window, options.seasonStart, options.seasonEnd)
            : null,
      });
    } catch {
      // Skip attachments that cannot resolve a window (e.g. end date in the past).
    }
  }

  const clashes = detectPlanSessionClashes(
    overlaySessions.map((session) => ({
      attachmentId: session.attachmentId ?? "",
      attachmentName:
        attachments.find((row) => (row.id ?? row.trainingPlanId) === session.attachmentId)
          ?.trainingPlanName ?? session.attachmentId,
      scheduledDateKey: session.scheduledDateKey,
      discipline: session.discipline,
      dayOffset: session.dayOffset ?? 0,
      sortOrder: session.sortOrder ?? 0,
      title: session.title,
    }))
  );

  const overlaid = overlayPlanLoadOnWeeks(weeks, overlaySessions, {
    conflicts: options?.conflicts,
    ownership: attachments.map((attachment) => ({
      attachmentId: attachment.id ?? attachment.trainingPlanId,
      owns: parseOwnsDisciplines(attachment.ownsDisciplines),
      fillLeftoverTiz: parseFillLeftoverTiz(attachment.fillLeftoverTiz),
    })),
  });

  const clashDates = new Set(clashes.map((clash) => clash.dateKey));

  return {
    windows,
    clashes,
    overlaySessions,
    weeks: overlaid.map((week) => {
      const coverages = coverageForWeek(week.weekStartDate, windows);
      const attached = coverages.some((row) => row.coverage === "attached");
      const pausedOnly =
        coverages.length > 0 && coverages.every((row) => row.coverage === "paused");
      const monday = mondayWeekStartKey(week.weekStartDate);
      const weekEnd = addDaysToDateKey(monday, 6);
      const hasClash = [...clashDates].some(
        (date) => date >= monday && date <= weekEnd
      );
      return {
        ...week,
        planCoverages: coverages,
        planCoverage: attached ? "attached" : pausedOnly ? "paused" : null,
        hasPlanClash: hasClash,
      };
    }),
  };
}

/** @deprecated Use previewAttachedPrograms. Kept for single-attachment call sites. */
export function previewAttachedPlanWeeks<T extends SimpleWeek>(
  weeks: T[],
  attachment: SimpleTrainingPlanAttachment,
  sessions: AttachedPlanSessionDraft[],
  todayKey: string
): { weeks: T[]; window: ApplyWindowWithPausesResult | null } {
  const result = previewAttachedPrograms(
    weeks,
    [attachment],
    { [attachment.trainingPlanId]: sessions },
    todayKey
  );
  return {
    weeks: result.weeks,
    window: result.windows[0]?.window ?? null,
  };
}

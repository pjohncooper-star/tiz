"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  addWeeks,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { DayCalendarPicker } from "@/components/day-calendar-picker";
import { CalendarWeekRow } from "@/components/calendar/calendar-week-row";
import { CalendarSessionCard } from "@/components/calendar/calendar-session-card";
import { DraggableActivityCard } from "@/components/calendar/calendar-activity-card";
import { ApplyTemplateDialog } from "@/components/calendar/apply-template-dialog";
import { WorkoutUploadButton } from "@/components/workout-upload-button";
import type { CalendarRangeData } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import { totalZoneMinutes } from "@/lib/workout/steps";
import {
  parseActivityDragId,
  parseSessionLinkDropId,
} from "@/lib/plan/session-link";
import { useWorkoutBuilder } from "@/components/calendar/use-workout-builder";
import { WorkoutBuilderPane } from "@/components/calendar/workout-builder-pane";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { WorkoutShadingSettings } from "@/lib/plan/workout-shading";
import type { PlanDiscipline } from "@/lib/plan/session";
import { Button } from "@/components/ui";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const MAX_PAST_WEEKS_WITHOUT_ACTIVITIES = 52;

type PlanningCalendarProps = {
  initialData: CalendarRangeData;
  currentWeekStart: string;
  initialScrollWeekStart?: string | null;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  workoutShadingSettings: WorkoutShadingSettings;
  activityDates: string[];
  minDate: string | null;
  maxDate: string | null;
};

function mergeRangeData(
  prev: CalendarRangeData,
  next: CalendarRangeData
): CalendarRangeData {
  const sessionMap = new Map(prev.sessions.map((s) => [s.id, s]));
  for (const s of next.sessions) sessionMap.set(s.id, s);

  const activityMap = new Map(prev.activities.map((a) => [a.id, a]));
  for (const a of next.activities) activityMap.set(a.id, a);

  const weekSet = new Set([...prev.weekStarts, ...next.weekStarts]);
  const weekStarts = [...weekSet].sort();

  return {
    sessions: [...sessionMap.values()],
    activities: [...activityMap.values()],
    weekStarts,
  };
}

export function PlanningCalendar({
  initialData,
  currentWeekStart,
  initialScrollWeekStart,
  disciplineSettings,
  workoutShadingSettings,
  activityDates,
  minDate,
  maxDate,
}: PlanningCalendarProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyWeekStart, setApplyWeekStart] = useState(currentWeekStart);
  const [applyHasSessions, setApplyHasSessions] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const loadSentinelRef = useRef<HTMLDivElement>(null);
  const loadPreviousSentinelRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);
  const canLoadPreviousRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(
    null
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const workoutBuilder = useWorkoutBuilder({
    onApplied: () => void handleRefresh(),
  });

  const sortedWeeks = useMemo(
    () => [...data.weekStarts].sort(),
    [data.weekStarts]
  );

  const sessionsForWeek = useCallback(
    (weekStart: string) => {
      const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
      const end = endOfWeek(start, WEEK_OPTS);
      return data.sessions.filter((s) => {
        const d = parseISO(`${s.scheduledDate}T12:00:00`);
        return d >= start && d <= end;
      });
    },
    [data.sessions]
  );

  const activitiesForWeek = useCallback(
    (weekStart: string) => {
      const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
      const end = endOfWeek(start, WEEK_OPTS);
      return data.activities.filter((a) => {
        const d = parseISO(a.startTime);
        return d >= start && d <= end;
      });
    },
    [data.activities]
  );

  const activeSession = activeDragId
    ? data.sessions.find((s) => s.id === activeDragId)
    : null;

  const activeActivityId = activeDragId ? parseActivityDragId(activeDragId) : null;
  const activeActivity = activeActivityId
    ? data.activities.find((a) => a.id === activeActivityId)
    : null;

  const scrollToWeekAsync = useCallback(
    async (weekStart: string) => {
      const scroll = () => {
        document
          .querySelector(`[data-week-start="${weekStart}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      if (sortedWeeks.includes(weekStart)) {
        scroll();
        return;
      }

      const from = weekStart;
      const to = format(endOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS), "yyyy-MM-dd");

      try {
        const res = await fetch(
          `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );
        if (res.ok) {
          const next: CalendarRangeData = await res.json();
          setData((prev) => mergeRangeData(prev, next));
          requestAnimationFrame(() => scroll());
        }
      } catch {
        // ignore
      }
    },
    [sortedWeeks]
  );

  useEffect(() => {
    if (scrolledRef.current) return;
    scrolledRef.current = true;

    const targetWeek = initialScrollWeekStart ?? currentWeekStart;

    const scrollToTarget = () => {
      const byWeek = document.querySelector(`[data-week-start="${targetWeek}"]`);
      if (byWeek) {
        byWeek.scrollIntoView({ block: "start" });
        return;
      }
      if (targetWeek === currentWeekStart) {
        document.getElementById("calendar-current-week")?.scrollIntoView({ block: "start" });
      }
    };

    if (initialScrollWeekStart && !sortedWeeks.includes(initialScrollWeekStart)) {
      void scrollToWeekAsync(initialScrollWeekStart).finally(() => {
        requestAnimationFrame(() => {
          canLoadPreviousRef.current = true;
        });
      });
      return;
    }

    scrollToTarget();
    requestAnimationFrame(() => {
      canLoadPreviousRef.current = true;
    });
  }, [currentWeekStart, initialScrollWeekStart, scrollToWeekAsync, sortedWeeks]);

  const earliestLoadableWeek = useMemo(() => {
    if (minDate) {
      return format(startOfWeek(parseISO(`${minDate}T12:00:00`), WEEK_OPTS), "yyyy-MM-dd");
    }
    return format(
      addWeeks(parseISO(`${currentWeekStart}T12:00:00`), -MAX_PAST_WEEKS_WITHOUT_ACTIVITIES),
      "yyyy-MM-dd"
    );
  }, [currentWeekStart, minDate]);

  const canLoadPrevious = useMemo(() => {
    if (sortedWeeks.length === 0) return false;
    return sortedWeeks[0] > earliestLoadableWeek;
  }, [earliestLoadableWeek, sortedWeeks]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending) return;
    pendingScrollRestoreRef.current = null;
    const delta = document.documentElement.scrollHeight - pending.prevScrollHeight;
    window.scrollTo(0, pending.prevScrollTop + delta);
  }, [sortedWeeks]);

  const loadMoreWeeks = useCallback(async () => {
    if (loadingMore || sortedWeeks.length === 0) return;
    const lastWeek = sortedWeeks[sortedWeeks.length - 1];
    const from = format(addWeeks(parseISO(`${lastWeek}T12:00:00`), 1), "yyyy-MM-dd");
    const to = format(
      endOfWeek(addWeeks(parseISO(`${from}T12:00:00`), 1), WEEK_OPTS),
      "yyyy-MM-dd"
    );

    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (res.ok) {
        const next: CalendarRangeData = await res.json();
        setData((prev) => mergeRangeData(prev, next));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, sortedWeeks]);

  const loadPreviousWeeks = useCallback(async () => {
    if (loadingPrevious || !canLoadPrevious || sortedWeeks.length === 0) return;

    const firstWeek = sortedWeeks[0];
    const firstWeekDate = parseISO(`${firstWeek}T12:00:00`);
    const from = format(startOfWeek(addWeeks(firstWeekDate, -2), WEEK_OPTS), "yyyy-MM-dd");
    const to = format(endOfWeek(addWeeks(firstWeekDate, -1), WEEK_OPTS), "yyyy-MM-dd");

    setLoadingPrevious(true);
    try {
      const res = await fetch(
        `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (res.ok) {
        const next: CalendarRangeData = await res.json();
        pendingScrollRestoreRef.current = {
          prevScrollHeight: document.documentElement.scrollHeight,
          prevScrollTop: window.scrollY,
        };
        setData((prev) => mergeRangeData(prev, next));
      }
    } finally {
      setLoadingPrevious(false);
    }
  }, [canLoadPrevious, loadingPrevious, sortedWeeks]);

  useEffect(() => {
    const el = loadSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreWeeks();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreWeeks, sortedWeeks.length]);

  useEffect(() => {
    const el = loadPreviousSentinelRef.current;
    if (!el || !canLoadPrevious) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!canLoadPreviousRef.current) return;
        if (entries[0]?.isIntersecting) void loadPreviousWeeks();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadPrevious, loadPreviousWeeks, sortedWeeks.length]);

  async function openApplyDialog() {
    setApplyWeekStart(currentWeekStart);
    const res = await fetch(
      `/api/plan/calendar/template/apply?weekStart=${encodeURIComponent(currentWeekStart)}`
    );
    const json = res.ok ? await res.json() : { hasSessions: false };
    setApplyHasSessions(!!json.hasSessions);
    setApplyOpen(true);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    if (await workoutBuilder.handleDragEnd(event)) return;

    if (active.data.current?.type === "activity") {
      const activityId = parseActivityDragId(active.id);
      const sessionId =
        parseSessionLinkDropId(over.id) ??
        (over.data.current?.type === "session-link"
          ? (over.data.current.sessionId as string)
          : null);
      if (!activityId || !sessionId) return;
      await handleLinkActivity(sessionId, activityId);
      return;
    }

    if (active.data.current?.type !== "session") return;

    const session = active.data.current.session as CalendarPlannedSession;
    const targetDate = over.data.current?.dateKey as string | undefined;
    if (!targetDate || targetDate === session.scheduledDate) return;

    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === session.id
          ? { ...s, scheduledDate: targetDate, linkedActivity: null }
          : s
      ),
    }));

    try {
      if (session.source === "ANCHORED_INSTANCE") {
        await fetch(`/api/plan/sessions/${session.id}/detach`, { method: "POST" });
      }
      const res = await fetch(`/api/plan/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: targetDate }),
      });
      if (!res.ok) throw new Error("Move failed");
      router.refresh();
    } catch {
      router.refresh();
    }
  }

  const reloadCalendarData = useCallback(
    async (weekStartsOverride?: string[]) => {
      const weeks = [...(weekStartsOverride ?? data.weekStarts)].sort();
      if (weeks.length === 0) {
        router.refresh();
        return;
      }
      const from = weeks[0];
      const to = format(
        endOfWeek(parseISO(`${weeks[weeks.length - 1]}T12:00:00`), WEEK_OPTS),
        "yyyy-MM-dd"
      );
      const res = await fetch(
        `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (res.ok) {
        const next: CalendarRangeData = await res.json();
        setData(next);
      }
      router.refresh();
    },
    [data.weekStarts, router]
  );

  function toLinkedActivity(
    activity: CalendarWeekActivity
  ): NonNullable<CalendarPlannedSession["linkedActivity"]> {
    return {
      id: activity.id,
      name: activity.name,
      startTime: activity.startTime,
      durationSeconds: activity.durationSeconds,
      elapsedSeconds: activity.durationSeconds,
      movingSeconds: null,
      distanceMeters: activity.distanceMeters,
      zoneMinutes: totalZoneMinutes(activity.zoneMinutes),
      discipline: activity.discipline,
      legType: activity.legType,
    };
  }

  async function handleLinkActivity(sessionId: string, activityId: string) {
    const activity = data.activities.find((a) => a.id === activityId);
    if (!activity) {
      await reloadCalendarData();
      return;
    }

    const linked = toLinkedActivity(activity);
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id === sessionId) {
          return { ...s, linkedActivity: linked };
        }
        if (s.linkedActivity?.id === activityId) {
          return { ...s, linkedActivity: null };
        }
        return s;
      }),
    }));

    try {
      const res = await fetch(`/api/plan/sessions/${sessionId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(typeof json.error === "string" ? json.error : "Could not link workout");
        await reloadCalendarData();
        return;
      }
      router.refresh();
    } catch {
      await reloadCalendarData();
    }
  }

  async function handleUnlinkActivity(sessionId: string) {
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId ? { ...s, linkedActivity: null } : s
      ),
    }));

    try {
      const res = await fetch(`/api/plan/sessions/${sessionId}/link`, { method: "DELETE" });
      if (!res.ok) {
        await reloadCalendarData();
        return;
      }
      router.refresh();
    } catch {
      await reloadCalendarData();
    }
  }

  async function handleRefresh() {
    await reloadCalendarData();
  }

  function handleTemplateApplied(appliedWeekStart: string) {
    const appliedWeek = format(
      startOfWeek(parseISO(`${appliedWeekStart}T12:00:00`), WEEK_OPTS),
      "yyyy-MM-dd"
    );
    const weeks = new Set([...data.weekStarts, appliedWeek]);
    void reloadCalendarData([...weeks].sort());
  }

  function scrollToToday() {
    setCalendarOpen(false);
    void scrollToWeekAsync(currentWeekStart);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveDragId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div className="space-y-4">
        <div className="sticky top-0 z-30 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex shrink-0 gap-2">
              <WorkoutUploadButton onUploaded={() => void handleRefresh()} />
              <Button type="button" onClick={() => void openApplyDialog()}>
                Apply template
              </Button>
              <Link href="/calendar/template">
                <Button type="button" variant="secondary">
                  Edit weekly template
                </Button>
              </Link>
              <Button
                type="button"
                variant={workoutBuilder.open ? "primary" : "secondary"}
                onClick={() => workoutBuilder.setOpen((v) => !v)}
              >
                Workout builder
              </Button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="secondary" onClick={scrollToToday}>
                Today
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCalendarOpen((open) => !open)}
              >
                {calendarOpen ? "Hide calendar" : "Jump to week"}
              </Button>
            </div>
          </div>

          {workoutBuilder.open ? (
            <WorkoutBuilderPane
              builder={workoutBuilder}
              onClose={() => workoutBuilder.setOpen(false)}
            />
          ) : null}

          {calendarOpen && (
            <div className="mt-3 max-h-[min(70vh,32rem)] overflow-y-auto border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <p className="mb-3 text-xs text-zinc-500">
                Pick any day to jump to that week (Mon–Sun). Click the month or year header to zoom
                out to months or years.
              </p>
              <div className="mx-auto w-full max-w-sm">
                <DayCalendarPicker
                  selectedDate={currentWeekStart}
                  onSelect={(date) => {
                    setCalendarOpen(false);
                    const weekStart = format(
                      startOfWeek(parseISO(`${date}T12:00:00`), WEEK_OPTS),
                      "yyyy-MM-dd"
                    );
                    void scrollToWeekAsync(weekStart);
                  }}
                  flaggableDates={activityDates}
                  minDate={null}
                  maxDate={null}
                  highlightWeekStart={currentWeekStart}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div
            ref={loadPreviousSentinelRef}
            className="py-2 text-center text-sm text-zinc-500"
          >
            {canLoadPrevious
              ? loadingPrevious
                ? "Loading previous weeks…"
                : "Scroll up for previous weeks"
              : null}
          </div>
          {sortedWeeks.map((weekStart) => (
            <CalendarWeekRow
              key={weekStart}
              weekStart={weekStart}
              currentWeekStart={currentWeekStart}
              sessions={sessionsForWeek(weekStart)}
              activities={activitiesForWeek(weekStart)}
              disciplineSettings={disciplineSettings}
              workoutShadingSettings={workoutShadingSettings}
              onSessionCreated={handleRefresh}
              activeDragId={activeDragId}
              onUnlinkActivity={(sessionId) => void handleUnlinkActivity(sessionId)}
              isCurrentWeek={weekStart === currentWeekStart}
            />
          ))}
        </div>

        <div ref={loadSentinelRef} className="py-4 text-center text-sm text-zinc-500">
          {loadingMore ? "Loading more weeks…" : "Scroll down for more weeks"}
        </div>
      </div>

      <DragOverlay>
        {activeSession ? (
          <CalendarSessionCard
            session={activeSession}
            workoutShadingSettings={workoutShadingSettings}
            isDragging
          />
        ) : null}
        {activeActivity ? (
          <DraggableActivityCard activity={activeActivity} isDragging />
        ) : null}
      </DragOverlay>

      <ApplyTemplateDialog
        open={applyOpen}
        defaultWeekStart={applyWeekStart}
        hasExistingSessions={applyHasSessions}
        onClose={() => setApplyOpen(false)}
        onApplied={handleTemplateApplied}
      />
    </DndContext>
  );
}

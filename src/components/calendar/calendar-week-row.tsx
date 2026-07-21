"use client";

import { useState } from "react";
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameWeek,
  parseISO,
  startOfWeek,
} from "date-fns";
import { CalendarDayColumn } from "@/components/calendar/calendar-day-column";
import { CalendarWeekSummary } from "@/components/calendar/calendar-week-summary";
import { WorkoutPool } from "@/components/calendar/workout-pool";
import {
  WEEK_DAY_HEADER_ROW_CLASS,
  WEEK_DAY_ROW_CLASS,
  weekDayColumnClass,
} from "@/components/calendar/week-day-layout";
import { groupWeekActivities } from "@/lib/plan/group-week-activities";
import {
  filterUnlinkedActivityGroups,
  linkedActivityIdsFromSessions,
} from "@/lib/plan/calendar/day-activities";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { WorkoutShadingSettings, WorkoutShadingTarget } from "@/lib/plan/workout-shading";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { PaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import type {
  PoolCardDraftMap,
  PoolDisciplineFilter,
} from "@/lib/plan/calendar/pool-session-card";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarWeekRowProps = {
  weekStart: string;
  currentWeekStart: string;
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  weekTarget?: CalendarWeekTarget | null;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  workoutShadingSettings: WorkoutShadingSettings;
  workoutShadingTarget: WorkoutShadingTarget;
  ecoLoadEnabled?: boolean;
  onSessionCreated: () => void;
  activeDragId: string | null;
  scrollAnchorRef?: React.RefObject<HTMLDivElement | null>;
  isCurrentWeek?: boolean;
  isFocusedWeek?: boolean;
  isPoolWeek?: boolean;
  showPool?: boolean;
  useWizardPool?: boolean;
  acceptsPoolDrop?: boolean;
  selectedDateKey: string | null;
  onSelectDay: (dateKey: string) => void;
  onClearSelection: () => void;
  poolDrafts: PoolCardDraftMap;
  poolDisciplineFilter: PoolDisciplineFilter;
  onPoolDisciplineFilterChange: (filter: PoolDisciplineFilter) => void;
  selectedPoolCardId: string | null;
  onSelectPoolCard: (cardId: string) => void;
  onLoadIntoBuilder?: (session: CalendarPlannedSession) => void;
  onArmBuildFromSession?: (session: CalendarPlannedSession) => void;
  onUnassignWorkout?: (session: CalendarPlannedSession) => void;
  onAutoFillEasyTiz?: () => void;
  paceContext?: PaceThresholdContext | null;
  /** Scroll margin so week tops clear sticky page chrome (+ Week TiZ when present). */
  scrollMarginTopPx?: number;
};

export function CalendarWeekRow({
  weekStart,
  currentWeekStart,
  sessions,
  activities,
  weekTarget,
  disciplineSettings,
  workoutShadingSettings,
  workoutShadingTarget,
  ecoLoadEnabled = false,
  onSessionCreated,
  activeDragId,
  scrollAnchorRef,
  isCurrentWeek,
  isFocusedWeek = false,
  isPoolWeek = false,
  showPool = false,
  useWizardPool = false,
  acceptsPoolDrop = true,
  selectedDateKey,
  onSelectDay,
  onClearSelection,
  poolDrafts,
  poolDisciplineFilter,
  onPoolDisciplineFilterChange,
  selectedPoolCardId,
  onSelectPoolCard,
  onLoadIntoBuilder,
  onArmBuildFromSession,
  onUnassignWorkout,
  onAutoFillEasyTiz,
  paceContext = null,
  scrollMarginTopPx = 72,
}: CalendarWeekRowProps) {
  const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
  const end = endOfWeek(start, WEEK_OPTS);
  const days = eachDayOfInterval({ start, end });
  const weekDays = days.map((d) => format(d, "yyyy-MM-dd"));

  const sessionsByDay = new Map<string, CalendarPlannedSession[]>();
  const activitiesByDay = new Map<string, CalendarWeekActivity[]>();
  for (const key of weekDays) {
    sessionsByDay.set(key, []);
    activitiesByDay.set(key, []);
  }

  for (const session of sessions) {
    if (sessionsByDay.has(session.scheduledDate)) {
      sessionsByDay.get(session.scheduledDate)!.push(session);
    }
  }

  for (const activity of activities) {
    const key = format(parseISO(activity.startTime), "yyyy-MM-dd");
    if (activitiesByDay.has(key)) {
      activitiesByDay.get(key)!.push(activity);
    }
  }

  const current =
    isCurrentWeek ?? isSameWeek(new Date(), start, WEEK_OPTS);

  const [clearing, setClearing] = useState(false);
  const deletableSessions = sessions.filter((session) => session.source !== "RACE");
  const hasDeletableSessions = deletableSessions.length > 0;

  async function clearPlannedSessions() {
    if (!hasDeletableSessions || clearing) return;

    const count = deletableSessions.length;
    const noun = count === 1 ? "session" : "sessions";
    const raceCount = sessions.length - count;
    const raceNote =
      raceCount > 0
        ? ` ${raceCount} race ${raceCount === 1 ? "day" : "days"} will be kept.`
        : "";
    if (
      !confirm(
        `Delete ${count} planned ${noun} for the week of ${format(start, "MMM d, yyyy")}?${raceNote}`
      )
    ) {
      return;
    }

    setClearing(true);
    try {
      const res = await fetch(
        `/api/plan/calendar/week?weekStart=${encodeURIComponent(weekStart)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        alert("Could not delete sessions");
        return;
      }
      onSessionCreated();
    } finally {
      setClearing(false);
    }
  }

  const dayGrid = (
    <div className="min-w-0 flex-1">
      <div className={WEEK_DAY_HEADER_ROW_CLASS}>
        {DAY_HEADERS.map((h, i) => (
          <div
            key={h}
            className={weekDayColumnClass(weekDays[i] === selectedDateKey)}
          >
            {h}
          </div>
        ))}
      </div>

      <div className={WEEK_DAY_ROW_CLASS}>
        {weekDays.map((dateKey) => {
          const daySessions = sessionsByDay.get(dateKey) ?? [];
          const linkedIds = linkedActivityIdsFromSessions(daySessions);
          const activityGroups = filterUnlinkedActivityGroups(
            groupWeekActivities(activitiesByDay.get(dateKey) ?? []),
            linkedIds
          );

          return (
            <CalendarDayColumn
              key={dateKey}
              dateKey={dateKey}
              sessions={daySessions}
              activityGroups={activityGroups}
              weekDays={weekDays}
              disciplineSettings={disciplineSettings}
              workoutShadingSettings={workoutShadingSettings}
              workoutShadingTarget={workoutShadingTarget}
              onSessionCreated={onSessionCreated}
              activeDragId={activeDragId}
              isSelected={selectedDateKey === dateKey}
              acceptsPoolDrop={acceptsPoolDrop}
              onSelectDay={() => onSelectDay(dateKey)}
              onClearSelection={onClearSelection}
              onLoadIntoBuilder={onLoadIntoBuilder}
              onArmBuildFromSession={onArmBuildFromSession}
              armedPoolCardId={selectedPoolCardId}
              onUnassignWorkout={onUnassignWorkout}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <section
      ref={scrollAnchorRef}
      style={{ scrollMarginTop: scrollMarginTopPx }}
      className={`rounded-lg transition-shadow ${
        isPoolWeek
          ? "ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-white dark:ring-emerald-600/70 dark:ring-offset-zinc-950"
          : isFocusedWeek
            ? "ring-2 ring-sky-400/70 ring-offset-2 ring-offset-white dark:ring-sky-600/70 dark:ring-offset-zinc-950"
            : ""
      }`}
      data-week-start={weekStart}
      id={current ? "calendar-current-week" : undefined}
    >
      <h2
        style={{ top: scrollMarginTopPx }}
        className="sticky z-10 mb-2 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/95 py-2 text-sm font-semibold backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      >        <div className="min-w-0">
          Week of {format(start, "MMM d, yyyy")}
          {current && (
            <span className="ml-2 rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-200">
              This week
            </span>
          )}
          {isPoolWeek ? (
            <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              Pool week
            </span>
          ) : null}
          {isFocusedWeek && !current && !isPoolWeek ? (
            <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              Pool focus
            </span>
          ) : null}
        </div>
        {hasDeletableSessions ? (
          <button
            type="button"
            disabled={clearing}
            className="shrink-0 rounded px-1.5 text-base leading-none text-zinc-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/50 dark:hover:text-red-400"
            onClick={() => void clearPlannedSessions()}
            aria-label={`Delete all planned sessions for the week of ${format(start, "MMMM d, yyyy")}`}
          >
            ×
          </button>
        ) : null}
      </h2>

      {showPool && !useWizardPool ? (
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
          <div className="w-full xl:w-60 xl:shrink-0">
            {weekTarget ? (
              <WorkoutPool
                weekTarget={weekTarget}
                sessions={sessions}
                activities={activities}
                weekStart={weekStart}
                currentWeekStart={currentWeekStart}
                drafts={poolDrafts}
                disciplineFilter={poolDisciplineFilter}
                onDisciplineFilterChange={onPoolDisciplineFilterChange}
                selectedCardId={selectedPoolCardId}
                onSelectCard={onSelectPoolCard}
                onAutoFillEasyTiz={onAutoFillEasyTiz}
                paceContext={paceContext}
              />
            ) : (
              <aside className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                <p className="text-[11px] text-zinc-500">
                  No season targets for this week. Pool appears for weeks inside your active plan.
                </p>
              </aside>
            )}
          </div>
          {dayGrid}
        </div>
      ) : (
        dayGrid
      )}

      <CalendarWeekSummary
        sessions={sessions}
        activities={activities}
        weekTarget={weekTarget ?? null}
        weekStart={weekStart}
        currentWeekStart={currentWeekStart}
        disciplineSettings={disciplineSettings}
        defaultExpanded={current}
        ecoLoadEnabled={ecoLoadEnabled}
        hideSeasonTarget={isPoolWeek}
      />
    </section>
  );
}

"use client";

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
  onUnassignWorkout?: (session: CalendarPlannedSession) => void;
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
  onUnassignWorkout,
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
      className={`scroll-mt-[4.5rem] rounded-lg transition-shadow ${
        isPoolWeek
          ? "ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-white dark:ring-emerald-600/70 dark:ring-offset-zinc-950"
          : isFocusedWeek
            ? "ring-2 ring-sky-400/70 ring-offset-2 ring-offset-white dark:ring-sky-600/70 dark:ring-offset-zinc-950"
            : ""
      }`}
      data-week-start={weekStart}
      id={current ? "calendar-current-week" : undefined}
    >
      <h2 className="sticky top-[4.5rem] z-10 mb-2 border-b border-zinc-200 bg-white/95 py-2 text-sm font-semibold backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
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
      />
    </section>
  );
}

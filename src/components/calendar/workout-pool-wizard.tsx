"use client";

import { useEffect, useMemo, useState } from "react";
import { addWeeks, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { Button } from "@/components/ui";
import { WorkoutPool } from "@/components/calendar/workout-pool";
import { WorkoutBuilderPane } from "@/components/calendar/workout-builder-pane";
import type { useWorkoutBuilder } from "@/components/calendar/use-workout-builder";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { UnscheduledAttachment } from "@/lib/plan/calendar/pool-unscheduled-attachment";
import { computeUnscheduledChips } from "@/lib/plan/calendar/unscheduled-chips";

const WEEK_OPTS = { weekStartsOn: 1 as const };

type PoolTab = "skeleton" | "build";

type WorkoutPoolWizardProps = {
  poolWeekStart: string;
  onPoolWeekChange: (weekStart: string) => void;
  weekTarget: CalendarWeekTarget | null;
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  currentWeekStart: string;
  selectedDateKey: string | null;
  armedUnscheduled: Record<string, UnscheduledAttachment>;
  onClearArmedUnscheduled: (chipId: string) => void;
  builder: ReturnType<typeof useWorkoutBuilder>;
};

function weekLabel(weekStart: string): string {
  const start = parseISO(`${weekStart}T12:00:00`);
  const end = endOfWeek(start, WEEK_OPTS);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

export function WorkoutPoolWizard({
  poolWeekStart,
  onPoolWeekChange,
  weekTarget,
  sessions,
  activities,
  currentWeekStart,
  selectedDateKey,
  armedUnscheduled,
  onClearArmedUnscheduled,
  builder,
}: WorkoutPoolWizardProps) {
  const unscheduledCount = useMemo(() => {
    if (!weekTarget) return 0;
    return computeUnscheduledChips(poolWeekStart, weekTarget, sessions).length;
  }, [poolWeekStart, weekTarget, sessions]);

  const [activeTab, setActiveTab] = useState<PoolTab>("skeleton");

  useEffect(() => {
    setActiveTab(unscheduledCount > 0 ? "skeleton" : "build");
  }, [poolWeekStart, unscheduledCount]);

  function shiftPoolWeek(delta: number) {
    const next = addWeeks(parseISO(`${poolWeekStart}T12:00:00`), delta);
    onPoolWeekChange(format(startOfWeek(next, WEEK_OPTS), "yyyy-MM-dd"));
  }

  useEffect(() => {
    if (activeTab === "build") {
      builder.setOpen(true);
    }
  }, [activeTab, builder]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/95 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="secondary" onClick={() => shiftPoolWeek(-1)} aria-label="Previous pool week">
            ◀
          </Button>
          <span className="min-w-[10rem] text-center text-sm font-medium tabular-nums">
            {weekLabel(poolWeekStart)}
          </span>
          <Button type="button" variant="secondary" onClick={() => shiftPoolWeek(1)} aria-label="Next pool week">
            ▶
          </Button>
        </div>

        <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
          {(["skeleton", "build"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                activeTab === tab
                  ? "bg-sky-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {!weekTarget ? (
        <p className="text-sm text-zinc-500">
          No season targets for this week. The pool works for weeks inside your active plan.
        </p>
      ) : activeTab === "skeleton" ? (
        <WorkoutPool
          weekTarget={weekTarget}
          sessions={sessions}
          activities={activities}
          weekStart={poolWeekStart}
          currentWeekStart={currentWeekStart}
          selectedDateKey={selectedDateKey}
          armedUnscheduled={armedUnscheduled}
          onClearArmedUnscheduled={onClearArmedUnscheduled}
          activeTab="skeleton"
          embedded
        />
      ) : (
        <div className="space-y-3">
          <WorkoutBuilderPane builder={builder} onClose={() => builder.setOpen(false)} />
          <WorkoutPool
            weekTarget={weekTarget}
            sessions={sessions}
            activities={activities}
            weekStart={poolWeekStart}
            currentWeekStart={currentWeekStart}
            selectedDateKey={selectedDateKey}
            armedUnscheduled={armedUnscheduled}
            onClearArmedUnscheduled={onClearArmedUnscheduled}
            activeTab="build"
            embedded
          />
        </div>
      )}
    </div>
  );
}

export function dateKeyInWeek(dateKey: string, weekStart: string): boolean {
  const monday = format(
    startOfWeek(parseISO(`${dateKey}T12:00:00`), WEEK_OPTS),
    "yyyy-MM-dd"
  );
  return monday === weekStart;
}

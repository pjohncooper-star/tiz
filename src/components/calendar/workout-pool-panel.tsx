"use client";

import { format, parseISO } from "date-fns";
import { WorkoutPool } from "@/components/calendar/workout-pool";
import { Button } from "@/components/ui";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { UnscheduledAttachment } from "@/lib/plan/calendar/pool-unscheduled-attachment";

type WorkoutPoolPanelProps = {
  focusedWeekStart: string | null;
  weekTarget: CalendarWeekTarget | null;
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  currentWeekStart: string;
  selectedDateKey: string | null;
  armedUnscheduled: Record<string, UnscheduledAttachment>;
  onClearArmedUnscheduled: (chipId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function PoolBody({
  focusedWeekStart,
  weekTarget,
  sessions,
  activities,
  currentWeekStart,
  selectedDateKey,
  armedUnscheduled,
  onClearArmedUnscheduled,
}: Omit<WorkoutPoolPanelProps, "open" | "onOpenChange">) {
  if (!focusedWeekStart) {
    return (
      <aside className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="text-[11px] text-zinc-500">Scroll to a week to see its workout pool.</p>
      </aside>
    );
  }

  if (!weekTarget) {
    return (
      <aside className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Week of {format(parseISO(`${focusedWeekStart}T12:00:00`), "MMM d, yyyy")}
          </p>
          <p className="text-[11px] text-zinc-500">
            No season targets for this week. Pool appears for weeks inside your active plan.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <WorkoutPool
      weekTarget={weekTarget}
      sessions={sessions}
      activities={activities}
      weekStart={focusedWeekStart}
      currentWeekStart={currentWeekStart}
      selectedDateKey={selectedDateKey}
      armedUnscheduled={armedUnscheduled}
      onClearArmedUnscheduled={onClearArmedUnscheduled}
    />
  );
}

function PoolChrome({
  weekLabel,
  onClose,
  children,
}: {
  weekLabel: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-[11px] text-zinc-500">
          {weekLabel ? `Focused · ${weekLabel}` : "Workout pool"}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 px-2 py-1 text-[11px]"
          onClick={onClose}
        >
          Hide
        </Button>
      </div>
      {children}
    </>
  );
}

/**
 * Single focused-week workout pool: sticky sidebar on xl+,
 * overlay drawer below xl when open.
 */
export function WorkoutPoolPanel(props: WorkoutPoolPanelProps) {
  const { open, onOpenChange, focusedWeekStart } = props;
  const weekLabel = focusedWeekStart
    ? format(parseISO(`${focusedWeekStart}T12:00:00`), "MMM d")
    : null;

  if (!open) return null;

  return (
    <>
      {/* Desktop / xl+ sticky column — no base `hidden`; max-xl hides below xl */}
      <div className="w-60 shrink-0 self-start max-xl:hidden">
        <div className="sticky top-[4.5rem] z-20 max-h-[calc(100vh-5.5rem)] space-y-2 overflow-y-auto pb-4">
          <PoolChrome weekLabel={weekLabel} onClose={() => onOpenChange(false)}>
            <PoolBody {...props} />
          </PoolChrome>
        </div>
      </div>

      {/* Mobile / below-xl drawer — fixed overlay, not in flex flow */}
      <div className="xl:hidden">
        <button
          type="button"
          className="fixed inset-0 z-40 bg-zinc-950/40"
          aria-label="Close workout pool"
          onClick={() => onOpenChange(false)}
        />
        <div
          className="fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,20rem)] flex-col border-r border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          role="dialog"
          aria-modal="true"
          aria-label="Workout pool"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <p className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              Workout pool{weekLabel ? ` · ${weekLabel}` : ""}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-2 py-1 text-[11px]"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <PoolBody {...props} />
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { format, isToday, parseISO } from "date-fns";
import { AddPlannedSessionForm } from "@/components/add-planned-session-form";
import { CalendarSessionCard } from "@/components/calendar/calendar-session-card";
import { CalendarActivityGroupCard } from "@/components/calendar/calendar-activity-card";
import { CalendarPlannedRaceGroupCard } from "@/components/calendar/calendar-planned-race-group-card";
import { groupPlannedSessions } from "@/lib/plan/group-planned-sessions";
import {
  ASSEMBLED_WORKOUT_DRAG_ID,
  isPoolPlacementDragId,
  isPoolUnscheduledDrag,
} from "@/lib/plan/workout-builder-dnd";
import { weekDayColumnClass } from "@/components/calendar/week-day-layout";
import type { WeekActivityGroup } from "@/components/dashboard-week-view";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { WorkoutShadingSettings, WorkoutShadingTarget } from "@/lib/plan/workout-shading";
import type { PlanDiscipline } from "@/lib/plan/session";

type CalendarDayColumnProps = {
  dateKey: string;
  sessions: CalendarPlannedSession[];
  activityGroups: WeekActivityGroup[];
  weekDays: string[];
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  workoutShadingSettings: WorkoutShadingSettings;
  workoutShadingTarget: WorkoutShadingTarget;
  onSessionCreated: () => void;
  activeDragId: string | null;
  isSelected: boolean;
  acceptsPoolDrop?: boolean;
  onSelectDay: () => void;
  onClearSelection: () => void;
};

export function CalendarDayColumn({
  dateKey,
  sessions,
  activityGroups,
  weekDays,
  disciplineSettings,
  workoutShadingSettings,
  workoutShadingTarget,
  onSessionCreated,
  activeDragId,
  isSelected,
  acceptsPoolDrop = true,
  onSelectDay,
  onClearSelection,
}: CalendarDayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: dateKey,
    data: { type: "day", dateKey },
    disabled:
      activeDragId != null &&
      isPoolPlacementDragId(activeDragId) &&
      !acceptsPoolDrop,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const day = parseISO(`${dateKey}T12:00:00`);
  const today = isToday(day);
  const hasPlannedSessions = sessions.length > 0;
  const activityDragActive = activeDragId?.startsWith("activity:") ?? false;
  const poolSessionDropActive =
    activeDragId != null &&
    isPoolPlacementDragId(activeDragId) &&
    !isPoolUnscheduledDrag(activeDragId);
  const workoutDragActive =
    activeDragId === ASSEMBLED_WORKOUT_DRAG_ID || poolSessionDropActive;
  const showSessionWorkoutDrop = workoutDragActive && acceptsPoolDrop;

  function openAdd() {
    onSelectDay();
    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    onClearSelection();
  }

  async function clearPlannedSessions() {
    if (!hasPlannedSessions || clearing) return;

    const dayLabel = format(day, "EEE MMM d");
    const count = sessions.length;
    const noun = count === 1 ? "session" : "sessions";
    if (!confirm(`Delete ${count} planned ${noun} on ${dayLabel}?`)) return;

    setClearing(true);
    try {
      const res = await fetch(
        `/api/plan/calendar/day?date=${encodeURIComponent(dateKey)}`,
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

  const groupedSessions = groupPlannedSessions(sessions);

  return (
    <div className={weekDayColumnClass(isSelected || addOpen)}>
      <div
        ref={setNodeRef}
        className={`flex h-full min-h-[8rem] flex-col rounded-md border p-2 transition ${
          isSelected || addOpen
            ? "border-sky-500 ring-1 ring-sky-500/40"
            : isOver
              ? "border-sky-500 bg-sky-50/50 dark:border-sky-500 dark:bg-sky-950/30"
              : today
                ? "border-sky-300 bg-sky-50/30 dark:border-sky-800 dark:bg-sky-950/20"
                : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-1">
          <span
            className={`text-xs font-medium ${today ? "text-sky-700 dark:text-sky-300" : "text-zinc-500"}`}
          >
            {format(day, "EEE d")}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {hasPlannedSessions ? (
              <button
                type="button"
                disabled={clearing}
                className="rounded px-1 text-sm leading-none text-zinc-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                onClick={() => void clearPlannedSessions()}
                aria-label={`Delete all planned sessions on ${format(day, "EEEE MMM d")}`}
              >
                ×
              </button>
            ) : null}
            <button
              type="button"
              className="rounded px-1 text-xs text-sky-600 hover:text-sky-800 dark:text-sky-400"
              onClick={openAdd}
              aria-label="Add session"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          {groupedSessions.map((item) =>
            item.kind === "multisport_race" ? (
              <CalendarPlannedRaceGroupCard key={item.groupId} group={item} />
            ) : (
              <CalendarSessionCard
                key={item.session.id}
                session={item.session}
                workoutShadingSettings={workoutShadingSettings}
                workoutShadingTarget={workoutShadingTarget}
                disciplineSettings={disciplineSettings}
                isDragging={activeDragId === item.session.id}
                showLinkDropTarget={activityDragActive}
                showWorkoutDropTarget={showSessionWorkoutDrop}
                onDeleted={onSessionCreated}
                onUpdated={onSessionCreated}
              />
            )
          )}
          {addOpen && (
            <AddPlannedSessionForm
              variant="inline"
              defaultDate={dateKey}
              weekDays={weekDays}
              disciplineSettings={disciplineSettings}
              onClose={closeAdd}
              onCreated={() => {
                closeAdd();
                onSessionCreated();
              }}
            />
          )}
          {activityGroups.map((group) => (
            <CalendarActivityGroupCard
              key={group.kind === "single" ? group.activity.id : group.groupId}
              group={group}
              activeDragId={activeDragId}
              disciplineSettings={disciplineSettings}
              onDeleted={onSessionCreated}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

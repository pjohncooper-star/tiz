"use client";

import Link from "next/link";
import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import { sessionCardClassName } from "@/lib/plan/workout-shading";
import type { WorkoutShadingSettings } from "@/lib/plan/workout-shading";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { formatSessionCardMetricLines } from "@/lib/plan/calendar/session-card-summary";
import {
  resolveSessionPoolSize,
  swimDisplayUnit,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import { workoutHref } from "@/lib/plan/workout-href";
import { WorkoutProfileMiniChart } from "@/components/workout-profile-mini-chart";

type CalendarSessionCardProps = {
  session: CalendarPlannedSession;
  workoutShadingSettings: WorkoutShadingSettings;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  isDragging?: boolean;
  onDeleted?: () => void;
  onUnlinkActivity?: (sessionId: string) => void;
  showLinkDropTarget?: boolean;
  showWorkoutDropTarget?: boolean;
};

function disciplineLabel(session: CalendarPlannedSession): string {
  const linked = session.linkedActivity;
  return (
    linked?.legType ??
    DISCIPLINE_DISPLAY_LABELS[session.discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS] ??
    session.discipline
  );
}

export function CalendarSessionCard({
  session,
  workoutShadingSettings,
  disciplineSettings,
  isDragging,
  onDeleted,
  onUnlinkActivity,
  showLinkDropTarget = false,
  showWorkoutDropTarget = false,
}: CalendarSessionCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({
    id: session.id,
    data: { type: "session", session },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `link:${session.id}`,
    data: { type: "session-link", sessionId: session.id, session },
  });

  const { setNodeRef: setWorkoutDropRef, isOver: isWorkoutOver } = useDroppable({
    id: `workout:${session.id}`,
    data: {
      type: "session-workout",
      sessionId: session.id,
      discipline: session.discipline,
      source: session.source,
      hasStructuredWorkout: session.stepCount > 0,
    },
  });

  const [deleting, setDeleting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const cardClassName =
    session.source === "RACE"
      ? `${sessionCardClassName(session, workoutShadingSettings)} border-amber-400/80 bg-amber-50/50 dark:border-amber-600/50 dark:bg-amber-950/20`
      : sessionCardClassName(session, workoutShadingSettings);

  const linked = session.linkedActivity;
  const canAcceptLink = showLinkDropTarget && !linked;

  const unitSettings = unitSettingsForDiscipline(
    session.discipline as PlanDiscipline,
    disciplineSettings
  );
  const poolSize = resolveSessionPoolSize(session.discipline, session.poolSize, disciplineSettings);
  const displayUnit =
    session.discipline === "SWIM" ? swimDisplayUnit(poolSize) : unitSettings.displayUnit;
  const metricLines = formatSessionCardMetricLines(session, displayUnit);
  const pillClassName = linked
    ? "rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
    : "rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sky-800 dark:bg-sky-900 dark:text-sky-200";

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    const confirmMessage = linked
      ? `Delete "${session.title}" and the linked workout "${linked.name}"? This cannot be undone.`
      : `Delete "${session.title}"? This cannot be undone.`;
    if (!confirm(confirmMessage)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/plan/sessions/${session.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Could not delete session");
        return;
      }
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  async function handleUnlink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onUnlinkActivity || unlinking) return;
    setUnlinking(true);
    try {
      onUnlinkActivity(session.id);
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
        setWorkoutDropRef(node);
      }}
      style={style}
      className={cardClassName}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
          aria-label="Drag to reschedule"
          {...listeners}
          {...attributes}
        >
          ⠿
        </button>
        <div className="min-w-0 flex-1">
          <Link
            href={workoutHref(session.id, { returnTo: "/calendar" })}
            className="block transition hover:opacity-90"
          >
            <p className="line-clamp-2 font-medium leading-snug pr-1">{session.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className={pillClassName}>{disciplineLabel(session)}</span>
            </div>
            {metricLines.length > 0 ? (
              <p className="mt-0.5 text-xs text-zinc-500">{metricLines[0]}</p>
            ) : null}
            {linked && linked.name.trim() !== session.title.trim() ? (
              <p className="mt-0.5 text-xs text-zinc-400">{linked.name}</p>
            ) : null}
          </Link>
          {session.workoutProfile ? (
            <div className="mt-1 w-full">
              <WorkoutProfileMiniChart profile={session.workoutProfile} />
            </div>
          ) : null}
        </div>
        {linked && onUnlinkActivity ? (
          <button
            type="button"
            disabled={unlinking}
            className="shrink-0 rounded px-1 text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-300"
            aria-label="Unlink completed workout"
            onClick={(e) => void handleUnlink(e)}
          >
            Unlink
          </button>
        ) : null}
        <button
          type="button"
          disabled={deleting}
          className="shrink-0 rounded p-0.5 text-sm leading-none text-zinc-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/50 dark:hover:text-red-400"
          aria-label={`Delete ${session.title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => void handleDelete(e)}
        >
          ×
        </button>
      </div>

      {canAcceptLink && isOver ? (
        <p className="mt-2 rounded border border-dashed border-emerald-400 bg-emerald-50/80 px-2 py-1 text-center text-[10px] font-medium text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
          Drop to link workout
        </p>
      ) : null}
      {showWorkoutDropTarget && session.source !== "RACE" && isWorkoutOver ? (
        <p className="mt-2 rounded border border-dashed border-sky-400 bg-sky-50/80 px-2 py-1 text-center text-[10px] font-medium text-sky-800 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
          Drop structured workout
        </p>
      ) : null}
    </div>
  );
}

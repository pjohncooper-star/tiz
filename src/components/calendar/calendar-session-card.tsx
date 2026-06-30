"use client";

import Link from "next/link";
import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import { sessionCardClassName } from "@/lib/plan/workout-shading";
import type { WorkoutShadingSettings } from "@/lib/plan/workout-shading";
import { POOL_SIZE_OPTIONS } from "@/lib/units/discipline-settings";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";
import { WorkoutProfileMiniChart } from "@/components/workout-profile-mini-chart";

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.round(minutes)}m`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function sourceLabel(source: CalendarPlannedSession["source"]): string {
  if (source === "RACE") return "Race";
  if (source === "ANCHORED_INSTANCE") return "Anchored";
  if (source === "TEMPLATE") return "Template";
  return "Planned";
}

type CalendarSessionCardProps = {
  session: CalendarPlannedSession;
  workoutShadingSettings: WorkoutShadingSettings;
  isDragging?: boolean;
  onDeleted?: () => void;
  onUnlinkActivity?: (sessionId: string) => void;
  showLinkDropTarget?: boolean;
};

export function CalendarSessionCard({
  session,
  workoutShadingSettings,
  isDragging,
  onDeleted,
  onUnlinkActivity,
  showLinkDropTarget = false,
}: CalendarSessionCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({
    id: session.id,
    data: { type: "session", session },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `link:${session.id}`,
    data: { type: "session-link", sessionId: session.id, session },
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

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    if (!confirm(`Delete "${session.title}"?`)) return;

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

  if (linked) {
    const metaParts = [
      format(parseISO(linked.startTime), "h:mm a"),
      formatDuration(linked.durationSeconds),
    ];
    if (linked.name.trim() !== session.title.trim()) {
      metaParts.push(linked.name);
    }

    return (
      <div
        ref={(node) => {
          setDragRef(node);
          setDropRef(node);
        }}
        style={style}
        className={`flex items-start gap-1 ${cardClassName}`}
      >
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
          aria-label="Drag to reschedule"
          {...listeners}
          {...attributes}
        >
          ⠿
        </button>
        <Link
          href={`/plan/sessions/${session.id}?returnTo=${encodeURIComponent("/calendar")}`}
          className="min-w-0 flex-1 transition hover:opacity-90"
        >
          <p className="line-clamp-2 font-medium leading-snug pr-1">{session.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{metaParts.join(" · ")}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {linked.legType ??
                DISCIPLINE_DISPLAY_LABELS[
                  session.discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS
                ] ??
                session.discipline}
            </span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              done
            </span>
          </div>
          {session.workoutProfile ? (
            <WorkoutProfileMiniChart profile={session.workoutProfile} />
          ) : null}
        </Link>
        {onUnlinkActivity ? (
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
    );
  }

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
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
        <Link
          href={`/plan/sessions/${session.id}?returnTo=${encodeURIComponent("/calendar")}`}
          className="min-w-0 flex-1"
        >
          <p className="line-clamp-2 font-medium leading-snug pr-1">{session.title}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {sourceLabel(session.source)}
            {session.source === "RACE" && session.estimatedDurationMinutes != null
              ? ` · ${formatGoalTimeDisplay(session.estimatedDurationMinutes)}`
              : session.totalMinutes > 0
                ? ` · ${formatMinutes(session.totalMinutes)}`
                : ""}
            {session.metricsSummary ? ` · ${session.metricsSummary}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sky-800 dark:bg-sky-900 dark:text-sky-200">
              {DISCIPLINE_DISPLAY_LABELS[
                session.discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS
              ] ?? session.discipline}
            </span>
            {session.source === "RACE" ? (
              <span className="inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                Race
              </span>
            ) : null}
            {session.discipline === "SWIM" && session.poolSize ? (
              <span className="inline-block rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200">
                {POOL_SIZE_OPTIONS.find((o) => o.value === session.poolSize)?.value ??
                  session.poolSize}
              </span>
            ) : null}
          </div>
          {session.workoutProfile ? (
            <WorkoutProfileMiniChart profile={session.workoutProfile} />
          ) : null}
        </Link>
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
    </div>
  );
}

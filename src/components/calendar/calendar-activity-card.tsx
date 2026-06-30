"use client";

import Link from "next/link";
import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
import type { WeekActivity, WeekActivityGroup } from "@/components/dashboard-week-view";
import { activityReturnHrefFromStartTime } from "@/lib/plan/activity-return";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function DeleteActivityButton({
  activity,
  onDeleted,
}: {
  activity: WeekActivity;
  onDeleted?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    if (!confirm(`Delete "${activity.name}"?`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/activities/${activity.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Could not delete activity");
        return;
      }
      onDeleted?.();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      disabled={deleting}
      className="shrink-0 rounded p-0.5 text-sm leading-none text-zinc-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/50 dark:hover:text-red-400"
      aria-label={`Delete ${activity.name}`}
      onClick={(e) => void handleDelete(e)}
    >
      ×
    </button>
  );
}

type DraggableActivityCardProps = {
  activity: WeekActivity;
  isDragging?: boolean;
  onDeleted?: () => void;
};

export function DraggableActivityCard({
  activity,
  isDragging,
  onDeleted,
}: DraggableActivityCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `activity:${activity.id}`,
    data: { type: "activity", activity },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const returnTo = encodeURIComponent(activityReturnHrefFromStartTime(activity.startTime));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-1 rounded-md border border-zinc-200 bg-white p-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
      <button
        type="button"
        className="mt-0.5 shrink-0 cursor-grab touch-none text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
        aria-label={`Drag ${activity.name} to link with a planned session`}
        {...listeners}
        {...attributes}
      >
        ⠿
      </button>
      <Link
        href={`/activities/${activity.id}?returnTo=${returnTo}`}
        className="min-w-0 flex-1 transition hover:opacity-90"
      >
        <p className="line-clamp-2 font-medium leading-snug pr-1">{activity.name}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {format(parseISO(activity.startTime), "h:mm a")} · {formatDuration(activity.durationSeconds)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {activity.legType ?? activity.discipline}
          </span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            done
          </span>
        </div>
      </Link>
      <DeleteActivityButton activity={activity} onDeleted={onDeleted} />
    </div>
  );
}


export function CalendarActivityGroupCard({
  group,
  onDeleted,
  activeDragId,
}: {
  group: WeekActivityGroup;
  onDeleted?: () => void;
  activeDragId?: string | null;
}) {
  if (group.kind === "single") {
    return (
      <DraggableActivityCard
        activity={group.activity}
        isDragging={activeDragId === `activity:${group.activity.id}`}
        onDeleted={onDeleted}
      />
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">Multisport</p>
      <p className="mt-1 text-xs text-zinc-500">{formatDuration(group.totalDurationSeconds)}</p>
      <ul className="mt-2 space-y-2">
        {group.legs.map((leg) => (
          <li key={leg.id}>
            <DraggableActivityCard
              activity={leg}
              isDragging={activeDragId === `activity:${leg.id}`}
              onDeleted={onDeleted}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

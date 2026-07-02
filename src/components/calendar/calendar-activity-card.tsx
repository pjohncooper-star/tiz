"use client";

import Link from "next/link";
import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { WeekActivity, WeekActivityGroup } from "@/components/dashboard-week-view";
import { activityReturnHrefFromStartTime } from "@/lib/plan/activity-return";
import { formatActivityCardMetricLines } from "@/lib/plan/calendar/session-card-summary";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import {
  swimDisplayUnit,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";

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

function activityDisplayUnit(
  activity: WeekActivity,
  disciplineSettings?: Record<PlanDiscipline, DisciplineUnitSettings>
): "METRIC" | "IMPERIAL" {
  const discipline = activity.discipline as PlanDiscipline;
  if (discipline === "SWIM") {
    return swimDisplayUnit(disciplineSettings?.SWIM?.poolSize);
  }
  return unitSettingsForDiscipline(discipline, disciplineSettings ?? {}).displayUnit;
}

function disciplineLabel(activity: WeekActivity): string {
  return (
    activity.legType ??
    DISCIPLINE_DISPLAY_LABELS[activity.discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS] ??
    activity.discipline
  );
}

type DraggableActivityCardProps = {
  activity: CalendarWeekActivity;
  isDragging?: boolean;
  onDeleted?: () => void;
  disciplineSettings?: Record<PlanDiscipline, DisciplineUnitSettings>;
};

export function DraggableActivityCard({
  activity,
  isDragging,
  onDeleted,
  disciplineSettings,
}: DraggableActivityCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `activity:${activity.id}`,
    data: { type: "activity", activity },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const returnTo = encodeURIComponent(activityReturnHrefFromStartTime(activity.startTime));
  const metricLines = formatActivityCardMetricLines(
    activity,
    activityDisplayUnit(activity, disciplineSettings)
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-1 rounded-md border border-zinc-200 bg-white p-1.5 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
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
        <p className="line-clamp-1 font-medium leading-snug pr-1">
          <span>{activity.name}</span>
          <span className="ml-1.5 inline-block rounded bg-zinc-100 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {disciplineLabel(activity)}
          </span>
        </p>
        {metricLines.length > 0 ? (
          <p className="mt-0.5 text-xs text-zinc-500">{metricLines[0]}</p>
        ) : null}
      </Link>
      <DeleteActivityButton activity={activity} onDeleted={onDeleted} />
    </div>
  );
}

export function CalendarActivityGroupCard({
  group,
  onDeleted,
  activeDragId,
  disciplineSettings,
}: {
  group: WeekActivityGroup;
  onDeleted?: () => void;
  activeDragId?: string | null;
  disciplineSettings?: Record<PlanDiscipline, DisciplineUnitSettings>;
}) {
  if (group.kind === "single") {
    return (
      <DraggableActivityCard
        activity={group.activity as CalendarWeekActivity}
        isDragging={activeDragId === `activity:${group.activity.id}`}
        onDeleted={onDeleted}
        disciplineSettings={disciplineSettings}
      />
    );
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="font-medium">Multisport</p>
      <p className="mt-0.5 text-xs text-zinc-500">{formatDuration(group.totalDurationSeconds)}</p>
      <ul className="mt-2 space-y-2">
        {group.legs.map((leg) => (
          <li key={leg.id}>
            <DraggableActivityCard
              activity={leg as CalendarWeekActivity}
              isDragging={activeDragId === `activity:${leg.id}`}
              onDeleted={onDeleted}
              disciplineSettings={disciplineSettings}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

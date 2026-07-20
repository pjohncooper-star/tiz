"use client";

import Link from "next/link";
import { useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import { CalendarSessionMetricGrid } from "@/components/calendar/calendar-session-metric-grid";
import { sessionCardClassName } from "@/lib/plan/workout-shading";
import type { WorkoutShadingSettings, WorkoutShadingTarget } from "@/lib/plan/workout-shading";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { buildSessionCardMetrics } from "@/lib/plan/calendar/session-card-summary";
import {
  resolveSessionPoolSize,
  swimDisplayUnit,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import { workoutHref } from "@/lib/plan/workout-href";
import { WorkoutProfileMiniChart } from "@/components/workout-profile-mini-chart";
import { SessionRoleBadge } from "@/components/calendar/session-role-badge";
import { nextSessionRole, sessionRoleAccentClass, sessionRoleShowsBadge } from "@/lib/plan/session-role";
import type { SessionRole } from "@prisma/client";

type CalendarSessionCardProps = {
  session: CalendarPlannedSession;
  workoutShadingSettings: WorkoutShadingSettings;
  workoutShadingTarget: WorkoutShadingTarget;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  isDragging?: boolean;
  onDeleted?: () => void;
  onUpdated?: () => void;
  showLinkDropTarget?: boolean;
  showWorkoutDropTarget?: boolean;
  /** When set, structured sessions show Load (into Build graph). */
  onLoadIntoBuilder?: (session: CalendarPlannedSession) => void;
  /** When set, generated sessions without a workout can arm the Build graph. */
  onArmBuild?: () => void;
  armedForBuild?: boolean;
  /** When set, structured sessions show Unassign. */
  onUnassignWorkout?: (session: CalendarPlannedSession) => void;
};

function disciplineLabel(discipline: string): string {
  return (
    DISCIPLINE_DISPLAY_LABELS[discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS] ?? discipline
  );
}

const poolSizePillClassName =
  "rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

export function CalendarSessionCard({
  session,
  workoutShadingSettings,
  workoutShadingTarget,
  disciplineSettings,
  isDragging,
  onDeleted,
  onUpdated,
  showLinkDropTarget = false,
  showWorkoutDropTarget = false,
  onLoadIntoBuilder,
  onArmBuild,
  armedForBuild = false,
  onUnassignWorkout,
}: CalendarSessionCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({
    id: session.id,
    data: { type: "session", session },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `link:${session.id}`,
    data: { type: "session-link", sessionId: session.id, session },
    disabled: !showLinkDropTarget,
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
    disabled: !showWorkoutDropTarget,
  });

  const [deleting, setDeleting] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const hasStructured = session.stepCount > 0;

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  const cardClassName =
    session.source === "RACE"
      ? `${sessionCardClassName(session, workoutShadingSettings, workoutShadingTarget)} border-amber-400/80 bg-amber-50/50 dark:border-amber-600/50 dark:bg-amber-950/20`
      : `${sessionCardClassName(session, workoutShadingSettings, workoutShadingTarget)} ${sessionRoleAccentClass(session.displaySessionRole)} ${
          armedForBuild
            ? "ring-2 ring-sky-400/70 dark:ring-sky-500/70"
            : ""
        }`;

  const linked = session.linkedActivity;
  const canAcceptLink = showLinkDropTarget && !linked;

  const unitSettings = unitSettingsForDiscipline(
    session.discipline as PlanDiscipline,
    disciplineSettings
  );
  const poolSize = resolveSessionPoolSize(session.discipline, session.poolSize, disciplineSettings);
  const displayUnit =
    session.discipline === "SWIM" ? swimDisplayUnit(poolSize) : unitSettings.displayUnit;
  const metrics = buildSessionCardMetrics(session, displayUnit);
  const pillClassName = linked
    ? "rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
    : "rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sky-800 dark:bg-sky-900 dark:text-sky-200";

  async function handleRoleCycle() {
    if (updatingRole || session.source === "RACE") return;
    const current =
      session.sessionRole !== "MODERATE" ? session.sessionRole : session.displaySessionRole;
    const nextRole = nextSessionRole(current as SessionRole);
    setUpdatingRole(true);
    try {
      const res = await fetch(`/api/plan/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionRole: nextRole }),
      });
      if (!res.ok) {
        alert("Could not update session role");
        return;
      }
      onUpdated?.();
    } finally {
      setUpdatingRole(false);
    }
  }

  async function handleUnassign(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (unassigning || !onUnassignWorkout || !hasStructured) return;
    if (!confirm(`Remove structured workout from "${session.title}"? The session stays on the calendar.`)) {
      return;
    }
    setUnassigning(true);
    try {
      await onUnassignWorkout(session);
    } finally {
      setUnassigning(false);
    }
  }

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
              <span className={pillClassName}>{disciplineLabel(session.discipline)}</span>
              {session.source !== "RACE" ? (
                sessionRoleShowsBadge(session.displaySessionRole as SessionRole) ? (
                  <SessionRoleBadge
                    role={session.displaySessionRole as SessionRole}
                    interactive
                    onClick={() => void handleRoleCycle()}
                  />
                ) : (
                  <button
                    type="button"
                    className="rounded px-1 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleRoleCycle();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    Set role
                  </button>
                )
              ) : null}
              {session.discipline === "SWIM" && poolSize ? (
                <span className={poolSizePillClassName}>{poolSize}</span>
              ) : null}
            </div>
            <CalendarSessionMetricGrid
              metrics={metrics}
              session={session}
              shadingSettings={workoutShadingSettings}
              shadingTarget={workoutShadingTarget}
            />
          </Link>
          {session.workoutProfile ? (
            <div className="mt-1 w-full">
              <WorkoutProfileMiniChart profile={session.workoutProfile} />
            </div>
          ) : null}
          {hasStructured && session.source !== "RACE" && (onLoadIntoBuilder || onUnassignWorkout) ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {onLoadIntoBuilder ? (
                <button
                  type="button"
                  className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/60"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onLoadIntoBuilder(session);
                  }}
                >
                  Load into Build
                </button>
              ) : null}
              {onUnassignWorkout ? (
                <button
                  type="button"
                  disabled={unassigning}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => void handleUnassign(e)}
                >
                  Unassign
                </button>
              ) : null}
            </div>
          ) : null}
          {!hasStructured && onArmBuild ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button
                type="button"
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  armedForBuild
                    ? "bg-sky-600 text-white dark:bg-sky-500"
                    : "bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:hover:bg-sky-900/60"
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onArmBuild();
                }}
              >
                {armedForBuild ? "Building" : "Build"}
              </button>
            </div>
          ) : null}
        </div>
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

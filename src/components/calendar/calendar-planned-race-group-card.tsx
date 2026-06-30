"use client";

import Link from "next/link";
import type { PlannedSessionGroup } from "@/lib/plan/group-planned-sessions";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";

function formatRaceGoalTime(minutes: number | null): string {
  return formatGoalTimeDisplay(minutes);
}

type CalendarPlannedRaceGroupCardProps = {
  group: Extract<PlannedSessionGroup, { kind: "multisport_race" }>;
};

export function CalendarPlannedRaceGroupCard({ group }: CalendarPlannedRaceGroupCardProps) {
  return (
    <div className="rounded-md border-2 border-amber-400/80 bg-amber-50/80 p-2 dark:border-amber-600/60 dark:bg-amber-950/30">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
          Multisport race
        </span>
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {group.title}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {group.legs.map((leg) => (
          <Link
            key={leg.id}
            href={`/plan/sessions/${leg.id}`}
            className="rounded border border-amber-300/60 bg-white/80 px-2 py-1 text-xs text-zinc-700 dark:border-amber-800 dark:bg-zinc-900/60 dark:text-zinc-300"
          >
            {DISCIPLINE_DISPLAY_LABELS[leg.discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS] ??
              leg.discipline}
          </Link>
        ))}
      </div>
      {(group.distanceMeters != null || group.estimatedDurationMinutes != null) && (
        <p className="mt-1 text-xs text-zinc-500">
          {group.distanceMeters != null && `${Math.round(group.distanceMeters)} m`}
          {group.distanceMeters != null && group.estimatedDurationMinutes != null && " · "}
          {group.estimatedDurationMinutes != null &&
            formatRaceGoalTime(group.estimatedDurationMinutes)}
        </p>
      )}
    </div>
  );
}

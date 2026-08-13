"use client";

import { buildTrainingPlanWeekGrid } from "@/lib/plan/training-plan";
import {
  totalTreeDurationMinutes,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DISCIPLINE_DOT_STYLES: Record<string, string> = {
  BIKE: "bg-sky-500",
  RUN: "bg-amber-500",
  SWIM: "bg-emerald-500",
  STRENGTH: "bg-zinc-400",
};

const MIN_DOT_PX = 8;
const MAX_DOT_PX = 22;

export type TrainingPlanWeekGridSession = {
  id: string;
  dayOffset: number;
  sortOrder: number;
  discipline: string;
  title: string;
  estimatedDurationMinutes: number | null;
  steps: WorkoutTreeDocument | null;
};

function sessionVolumeMinutes(session: TrainingPlanWeekGridSession): number {
  if (session.estimatedDurationMinutes != null && session.estimatedDurationMinutes > 0) {
    return session.estimatedDurationMinutes;
  }
  if (session.steps?.nodes.length) {
    return totalTreeDurationMinutes(session.steps.nodes);
  }
  return 0;
}

function primarySession(sessions: TrainingPlanWeekGridSession[]): TrainingPlanWeekGridSession | null {
  if (sessions.length === 0) return null;
  return [...sessions].sort(
    (a, b) => sessionVolumeMinutes(b) - sessionVolumeMinutes(a) || a.sortOrder - b.sortOrder
  )[0]!;
}

function dayVolumeMinutes(sessions: TrainingPlanWeekGridSession[]): number {
  return sessions.reduce((sum, session) => sum + sessionVolumeMinutes(session), 0);
}

function dotSizePx(minutes: number, maxMinutes: number): number {
  if (minutes <= 0) return MIN_DOT_PX;
  if (maxMinutes <= 0) return MIN_DOT_PX;
  return MIN_DOT_PX + ((MAX_DOT_PX - MIN_DOT_PX) * minutes) / maxMinutes;
}

export function TrainingPlanWeekGrid({
  anchorWeekday,
  durationDays,
  sessions,
  selectedId,
  onSelectSession,
  onAddSession,
}: {
  anchorWeekday: string;
  durationDays: number;
  sessions: TrainingPlanWeekGridSession[];
  selectedId: string | null;
  onSelectSession: (id: string) => void;
  onAddSession: (dayOffset: number) => void;
}) {
  const rows = buildTrainingPlanWeekGrid(anchorWeekday, durationDays, sessions);
  const maxMinutes = Math.max(
    0,
    ...rows.flatMap((row) => row.map((cell) => dayVolumeMinutes(cell.sessions)))
  );

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-zinc-500">
        {DAY_HEADERS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="space-y-0.5">
        {rows.map((row, week) => (
          <div key={week} className="grid grid-cols-7 gap-0.5">
            {row.map((cell) => {
              if (cell.dayOffset == null) {
                return <div key={`${week}-${cell.col}`} className="h-10" />;
              }
              const dayOffset = cell.dayOffset;
              const primary = primarySession(cell.sessions);
              const minutes = dayVolumeMinutes(cell.sessions);
              const selected = primary != null && primary.id === selectedId;
              const size = primary ? dotSizePx(minutes, maxMinutes) : 0;
              const titles = cell.sessions.map((s) => s.title).filter(Boolean).join(" · ");
              return (
                <div
                  key={`${week}-${cell.col}`}
                  className="flex h-10 flex-col items-center justify-between py-0.5"
                >
                  <div className="flex h-6 items-center justify-center">
                    {primary ? (
                      <button
                        type="button"
                        onClick={() => onSelectSession(primary.id)}
                        className={`rounded-full ${DISCIPLINE_DOT_STYLES[primary.discipline] ?? DISCIPLINE_DOT_STYLES.STRENGTH} ${
                          selected ? "ring-2 ring-sky-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900" : ""
                        }`}
                        style={{ width: size, height: size }}
                        title={titles || primary.title}
                        aria-label={titles || `Day ${dayOffset + 1}`}
                      />
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddSession(dayOffset)}
                    className="leading-none text-[10px] font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    aria-label={`Add session on day ${dayOffset + 1}`}
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

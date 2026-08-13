"use client";

import { buildTrainingPlanWeekGrid } from "@/lib/plan/training-plan";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DISCIPLINE_CHIP_STYLES: Record<string, string> = {
  BIKE: "bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200",
  RUN: "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200",
  SWIM: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200",
  STRENGTH: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export type TrainingPlanWeekGridSession = {
  id: string;
  dayOffset: number;
  sortOrder: number;
  discipline: string;
  title: string;
};

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

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500">
        {DAY_HEADERS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((row, week) => (
          <div key={week} className="grid grid-cols-7 gap-1">
            {row.map((cell) => {
              if (cell.dayOffset == null) {
                return (
                  <div
                    key={`${week}-${cell.col}`}
                    className="min-h-[5.5rem] rounded-md border border-transparent bg-zinc-50 dark:bg-zinc-950/40"
                  />
                );
              }
              const dayOffset = cell.dayOffset;
              return (
                <div
                  key={`${week}-${cell.col}`}
                  className="flex min-h-[5.5rem] flex-col gap-1 rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {cell.sessions.map((session) => {
                    const chip =
                      DISCIPLINE_CHIP_STYLES[session.discipline] ??
                      DISCIPLINE_CHIP_STYLES.STRENGTH;
                    const selected = session.id === selectedId;
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className={`truncate rounded px-1.5 py-1 text-left text-xs font-medium ${chip} ${
                          selected ? "ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-zinc-900" : ""
                        }`}
                        title={session.title}
                      >
                        {session.title}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => onAddSession(dayOffset)}
                    className="mt-auto rounded px-1 py-0.5 text-xs font-medium text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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

import Link from "next/link";
import { format, parseISO } from "date-fns";

export type DayStripSession = {
  id: string;
  kind: "planned" | "completed";
  title: string;
  discipline: string;
  scheduledDate: string;
  plannedMinutes: number | null;
  completedMinutes: number | null;
  href: string;
  status: "planned" | "completed" | "missed" | "unplanned";
};

export type DayStripColumn = {
  date: string;
  label: string;
  isToday: boolean;
  sessions: DayStripSession[];
};

function formatMinutes(minutes: number | null): string | null {
  if (minutes == null || !(minutes > 0)) return null;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function statusStyles(status: DayStripSession["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40";
    case "missed":
      return "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40";
    case "unplanned":
      return "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40";
    default:
      return "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900";
  }
}

function statusLabel(status: DayStripSession["status"]): string {
  switch (status) {
    case "completed":
      return "Done";
    case "missed":
      return "Missed";
    case "unplanned":
      return "Extra";
    default:
      return "Planned";
  }
}

export function DashboardDayStrip({ days }: { days: DayStripColumn[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {days.map((day) => (
        <div
          key={day.date}
          className={`rounded-lg border p-3 ${
            day.isToday
              ? "border-sky-400 dark:border-sky-600"
              : "border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {day.label}
            </h3>
            <p className="text-xs text-zinc-500">
              {format(parseISO(`${day.date}T12:00:00`), "MMM d")}
            </p>
          </div>
          {day.sessions.length === 0 ? (
            <p className="text-sm text-zinc-500">No sessions</p>
          ) : (
            <ul className="space-y-2">
              {day.sessions.map((session) => {
                const planned = formatMinutes(session.plannedMinutes);
                const completed = formatMinutes(session.completedMinutes);
                return (
                  <li key={`${session.kind}-${session.id}`}>
                    <Link
                      href={session.href}
                      className={`block rounded-md border p-2 text-sm transition hover:border-sky-400 dark:hover:border-sky-600 ${statusStyles(session.status)}`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-950/50 dark:text-zinc-300">
                          {session.discipline}
                        </span>
                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-950/50">
                          {statusLabel(session.status)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 font-medium leading-snug">
                        {session.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {planned && completed && planned !== completed
                          ? `${planned} planned · ${completed} done`
                          : completed
                            ? completed
                            : planned
                              ? `${planned} planned`
                              : "—"}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

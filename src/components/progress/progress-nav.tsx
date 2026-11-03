import Link from "next/link";
import { mondayWeekStartKey } from "@/lib/dates";
import {
  progressHref,
  shiftWeekStart,
  type ProgressView,
} from "@/lib/progress/href";

function tabClass(active: boolean): string {
  return `rounded px-3 py-1.5 text-sm font-medium ${
    active
      ? "bg-sky-600 text-white"
      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;
}

const NAV_BUTTON =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

export function ProgressNav({
  view,
  weekStart,
  todayKey,
}: {
  view: ProgressView;
  weekStart: string;
  todayKey: string;
}) {
  const currentWeek = mondayWeekStartKey(todayKey);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
        role="group"
        aria-label="Progress view"
      >
        <Link
          href={progressHref({ view: "week", weekStart })}
          className={tabClass(view === "week")}
          aria-current={view === "week" ? "page" : undefined}
        >
          Week
        </Link>
        <Link
          href={progressHref({ view: "season" })}
          className={tabClass(view === "season")}
          aria-current={view === "season" ? "page" : undefined}
        >
          Season
        </Link>
      </div>

      {view === "week" ? (
        <div className="flex items-center gap-2">
          <Link
            href={progressHref({ view: "week", weekStart: shiftWeekStart(weekStart, -1) })}
            className={NAV_BUTTON}
            aria-label="Previous week"
          >
            ◀
          </Link>
          <Link
            href={progressHref({ view: "week", weekStart: currentWeek })}
            className={NAV_BUTTON}
          >
            This week
          </Link>
          <Link
            href={progressHref({ view: "week", weekStart: shiftWeekStart(weekStart, 1) })}
            className={NAV_BUTTON}
            aria-label="Next week"
          >
            ▶
          </Link>
        </div>
      ) : null}
    </div>
  );
}

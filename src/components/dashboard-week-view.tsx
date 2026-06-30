"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameWeek,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { DayCalendarPicker } from "@/components/day-calendar-picker";
import { Button } from "@/components/ui";

export type WeekActivity = {
  id: string;
  name: string;
  startTime: string;
  discipline: string;
  source: string;
  signalUsed: string | null;
  noUsableSignal: boolean;
  durationSeconds: number;
  multisportGroupId: string | null;
  sessionIndex: number | null;
  legType: string | null;
};

export type WeekActivityGroup =
  | { kind: "single"; activity: WeekActivity }
  | {
      kind: "multisport";
      groupId: string;
      startTime: string;
      totalDurationSeconds: number;
      legs: WeekActivity[];
    };

function groupWeekActivities(activities: WeekActivity[]): WeekActivityGroup[] {
  const groups = new Map<string, WeekActivity[]>();
  const standalone: WeekActivity[] = [];

  for (const a of activities) {
    if (a.multisportGroupId) {
      const list = groups.get(a.multisportGroupId) ?? [];
      list.push(a);
      groups.set(a.multisportGroupId, list);
    } else {
      standalone.push(a);
    }
  }

  const result: WeekActivityGroup[] = standalone.map((activity) => ({
    kind: "single",
    activity,
  }));

  for (const [groupId, legs] of groups) {
    legs.sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
    result.push({
      kind: "multisport",
      groupId,
      startTime: legs[0].startTime,
      totalDurationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
      legs,
    });
  }

  return result.sort((a, b) => {
    const ta = a.kind === "single" ? a.activity.startTime : a.startTime;
    const tb = b.kind === "single" ? b.activity.startTime : b.startTime;
    return ta.localeCompare(tb);
  });
}

type DashboardWeekViewProps = {
  weekStart: string;
  activities: WeekActivity[];
  activityDates: string[];
  minDate: string | null;
  maxDate: string | null;
};

const WEEK_OPTS = { weekStartsOn: 1 as const };
const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateKey(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd");
}

function ActivityCard({ a }: { a: WeekActivity }) {
  return (
    <Link
      href={`/activities/${a.id}`}
      className="block rounded-md border border-zinc-200 bg-white p-2 text-sm shadow-sm transition hover:border-sky-400 hover:shadow dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-sky-600"
    >
      <p className="line-clamp-2 font-medium leading-snug">{a.name}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {format(parseISO(a.startTime), "h:mm a")} · {formatDuration(a.durationSeconds)}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {a.legType ?? a.discipline}
        </span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
          {a.signalUsed ?? (a.noUsableSignal ? "no signal" : "…")}
        </span>
      </div>
    </Link>
  );
}

function MultisportCard({ group }: { group: Extract<WeekActivityGroup, { kind: "multisport" }> }) {
  return (
    <div className="rounded-md border border-violet-200 bg-white p-2 text-sm shadow-sm dark:border-violet-900 dark:bg-zinc-900">
      <div className="mb-2 border-b border-violet-100 pb-1.5 dark:border-violet-900/60">
        <p className="font-medium leading-snug">Multisport</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {format(parseISO(group.startTime), "h:mm a")} ·{" "}
          {formatDuration(group.totalDurationSeconds)} · {group.legs.length} legs
        </p>
      </div>
      <div className="flex flex-col gap-1.5 pl-1">
        {group.legs.map((leg) => (
          <Link
            key={leg.id}
            href={`/activities/${leg.id}`}
            className="block rounded border border-zinc-100 bg-zinc-50/80 p-1.5 transition hover:border-sky-400 dark:border-zinc-800 dark:bg-zinc-950/60"
          >
            <p className="text-xs font-medium">{leg.name}</p>
            <p className="text-[10px] text-zinc-500">
              {formatDuration(leg.durationSeconds)} ·{" "}
              {leg.signalUsed ?? (leg.noUsableSignal ? "no signal" : "…")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function DashboardWeekView({
  weekStart,
  activities,
  activityDates,
  minDate,
  maxDate,
}: DashboardWeekViewProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
  const end = endOfWeek(start, WEEK_OPTS);
  const days = eachDayOfInterval({ start, end });
  const today = new Date();
  const isCurrentWeek = isSameWeek(today, start, WEEK_OPTS);

  const byDay = new Map<string, WeekActivityGroup[]>();
  for (const day of days) {
    byDay.set(format(day, "yyyy-MM-dd"), []);
  }
  const dayActivities = new Map<string, WeekActivity[]>();
  for (const day of days) {
    dayActivities.set(format(day, "yyyy-MM-dd"), []);
  }
  for (const a of activities) {
    const key = toDateKey(a.startTime);
    dayActivities.get(key)?.push(a);
  }
  for (const [key, list] of dayActivities) {
    byDay.set(key, groupWeekActivities(list));
  }

  function goToWeek(date: Date) {
    const params = new URLSearchParams();
    params.set("week", format(date, "yyyy-MM-dd"));
    router.push(`${pathname}?${params.toString()}`);
    setCalendarOpen(false);
  }

  function onCalendarSelect(date: string) {
    goToWeek(parseISO(`${date}T12:00:00`));
  }

  const canGoPrev =
    !minDate ||
    startOfWeek(subWeeks(start, 1), WEEK_OPTS) >= startOfWeek(parseISO(minDate), WEEK_OPTS);
  const canGoNext =
    !maxDate ||
    startOfWeek(addWeeks(start, 1), WEEK_OPTS) <= startOfWeek(parseISO(maxDate), WEEK_OPTS);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {format(start, "MMM d")} – {format(end, "MMM d, yyyy")}
          </p>
          <p className="text-xs text-zinc-500">
            {activities.length} {activities.length === 1 ? "workout" : "workouts"} this week
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5"
            onClick={() => goToWeek(subWeeks(start, 1))}
            disabled={!canGoPrev}
          >
            ← Prev
          </Button>
          {!isCurrentWeek && (
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5"
              onClick={() => goToWeek(today)}
            >
              Today
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5"
            onClick={() => goToWeek(addWeeks(start, 1))}
            disabled={!canGoNext}
          >
            Next →
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-3 py-1.5"
            onClick={() => setCalendarOpen((o) => !o)}
          >
            {calendarOpen ? "Hide calendar" : "Jump to week"}
          </Button>
        </div>
      </div>

      {calendarOpen && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="mb-2 text-xs text-zinc-500">
            Pick any day — the dashboard shows that week (Mon–Sun). Click the month or year to
            zoom out.
          </p>
          <DayCalendarPicker
            selectedDate={format(start, "yyyy-MM-dd")}
            onSelect={onCalendarSelect}
            flaggableDates={activityDates}
            minDate={minDate}
            maxDate={maxDate}
            highlightWeekStart={format(start, "yyyy-MM-dd")}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {days.map((day, i) => {
          const key = format(day, "yyyy-MM-dd");
          const dayGroups = byDay.get(key) ?? [];
          const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");

          return (
            <div
              key={key}
              className={`flex min-h-[8rem] flex-col rounded-lg border p-2 ${
                isToday
                  ? "border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20"
                  : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40"
              }`}
            >
              <div className="mb-2 border-b border-zinc-200 pb-1.5 dark:border-zinc-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {DAY_HEADERS[i]}
                </p>
                <p className={`text-sm font-medium ${isToday ? "text-sky-700 dark:text-sky-400" : ""}`}>
                  {format(day, "MMM d")}
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {dayGroups.length === 0 ? (
                  <p className="text-xs text-zinc-400">—</p>
                ) : (
                  dayGroups.map((g) =>
                    g.kind === "multisport" ? (
                      <MultisportCard key={g.groupId} group={g} />
                    ) : (
                      <ActivityCard key={g.activity.id} a={g.activity} />
                    )
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

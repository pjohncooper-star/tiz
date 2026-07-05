"use client";

import { format, parseISO } from "date-fns";
import { useMemo } from "react";
import { parseDateKey } from "@/lib/dates";
import {
  buildRaceMarkersFromGoalEvents,
  goalEventsForRaceMarkers,
} from "@/lib/plan/season/preview-race-markers";
import { monthTicksForWeeks } from "@/lib/plan/season/season-dates";
import type { SimpleGoalEvent, SimplePhase, SimpleWeek } from "./simple-planner-types";

type SimplePlannerTimelineProps = {
  seasonStart: string;
  weeks: SimpleWeek[];
  phases: SimplePhase[];
  goalEvents: SimpleGoalEvent[];
  primaryGoalEvent: SimpleGoalEvent | null;
  selectedWeekIndex: number | null;
  onSelectWeek: (weekIndex: number) => void;
};

export function SimplePlannerTimeline({
  seasonStart,
  weeks,
  phases,
  goalEvents,
  primaryGoalEvent,
  selectedWeekIndex,
  onSelectWeek,
}: SimplePlannerTimelineProps) {
  const startDate = parseDateKey(seasonStart);
  const displayWeeks = Math.max(weeks.length, 1);
  const maxHours = Math.max(...weeks.map((week) => week.totalHours), 1);

  const monthTicks = useMemo(
    () => monthTicksForWeeks(startDate, displayWeeks),
    [displayWeeks, startDate]
  );

  const raceMarkers = useMemo(
    () =>
      buildRaceMarkersFromGoalEvents(
        startDate,
        displayWeeks,
        goalEventsForRaceMarkers(primaryGoalEvent, goalEvents)
      ),
    [displayWeeks, goalEvents, primaryGoalEvent, startDate]
  );

  function phaseColor(weekIndex: number): string {
    const phase = phases.find(
      (item) => weekIndex >= item.startWeekIndex && weekIndex <= item.endWeekIndex
    );
    return phase?.color ?? "#94a3b8";
  }

  return (
    <div className="space-y-3">
      <div className="relative h-28">
        <div className="absolute inset-x-0 bottom-6 flex h-20 items-end gap-0.5">
          {weeks.map((week) => {
            const heightPct = (week.totalHours / maxHours) * 100;
            const selected = selectedWeekIndex === week.weekIndex;
            return (
              <button
                key={week.weekIndex}
                type="button"
                onClick={() => onSelectWeek(week.weekIndex)}
                className={`min-w-0 flex-1 rounded-t transition ${
                  selected ? "ring-2 ring-sky-500 ring-offset-1" : ""
                } ${week.isRestWeek ? "opacity-50" : ""}`}
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: phaseColor(week.weekIndex),
                }}
                title={`W${week.weekIndex + 1}: ${week.totalHours}h`}
              />
            );
          })}
        </div>

        {raceMarkers.map((marker) => (
          <div
            key={marker.key}
            className="pointer-events-none absolute bottom-0 z-10 -translate-x-1/2"
            style={{ left: `${marker.positionFraction * 100}%` }}
            title={marker.tooltip}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                marker.priority === "A"
                  ? "bg-red-500"
                  : marker.priority === "B"
                    ? "bg-amber-500"
                    : "bg-zinc-500"
              }`}
            >
              {marker.priority}
            </span>
          </div>
        ))}
      </div>

      {monthTicks.length > 0 && (
        <div className="relative h-4 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          {monthTicks.map((tick) => (
            <span
              key={`${tick.label}-${tick.weekIndex}`}
              className="absolute whitespace-nowrap"
              style={{ left: `${(tick.weekIndex / displayWeeks) * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      )}

      <div className="relative h-4">
        {phases.map((phase) => {
          const widthPct =
            ((phase.endWeekIndex - phase.startWeekIndex + 1) / displayWeeks) * 100;
          const leftPct = (phase.startWeekIndex / displayWeeks) * 100;
          return (
            <div
              key={phase.id ?? `${phase.name}-${phase.startWeekIndex}`}
              className="absolute top-0 flex h-4 items-center overflow-hidden rounded-sm px-1 text-[10px] font-medium text-white"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                backgroundColor: phase.color,
              }}
              title={phase.name}
            >
              <span className="truncate">{phase.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function formatWeekDateRange(weekStartDate: string): string {
  const start = parseISO(`${weekStartDate}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

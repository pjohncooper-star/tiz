"use client";

import { format } from "date-fns";
import { useMemo } from "react";
import { RaceMarkerOverlay } from "@/components/season/race-marker-overlay";
import type { GoalEventSummary } from "@/components/season/season-planner-shell";
import { SeasonMonthTicks } from "@/components/season/season-month-ticks";
import {
  ChartHoverTooltipLayer,
  useChartHoverTooltip,
} from "@/components/season/chart-hover-tooltip";
import { parseDateKey } from "@/lib/dates";
import {
  buildRaceMarkersFromGoalEvents,
  goalEventsForRaceMarkers,
} from "@/lib/plan/season/preview-race-markers";
import { monthTicksForWeeks } from "@/lib/plan/season/season-dates";

type WeekVolume = {
  weekIndex: number;
  weekStartDate: string;
  isDeLoadWeek: boolean;
  totalHours: number;
};

type PhaseVolume = {
  id: string;
  name: string;
  sortOrder: number;
  weekCount: number;
  color: string;
};

type WeeklyVolumeChartProps = {
  weeks: WeekVolume[];
  phases: PhaseVolume[];
  startDate: string;
  goalEvents?: GoalEventSummary[];
  primaryGoalEvent?: {
    name: string;
    date: string;
    disciplines: GoalEventSummary["disciplines"];
    estimatedDurationMinutes?: number | null;
    swimGoalMinutes?: number | null;
    bikeGoalMinutes?: number | null;
    runGoalMinutes?: number | null;
  } | null;
  selectedWeek: number;
  onSelectWeek: (weekIndex: number) => void;
};

function phaseForWeekIndex(phases: PhaseVolume[], weekIndex: number): PhaseVolume | null {
  let cursor = 0;
  for (const phase of [...phases].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (weekIndex >= cursor && weekIndex < cursor + phase.weekCount) {
      return phase;
    }
    cursor += phase.weekCount;
  }
  return null;
}

function weekBarTooltip(week: WeekVolume): string {
  const startLabel = format(parseDateKey(week.weekStartDate), "MMM d, yyyy");
  const deLoad = week.isDeLoadWeek ? " · De-load" : "";
  return `${startLabel} · ${week.totalHours} h${deLoad}`;
}

export function WeeklyVolumeChart({
  weeks,
  phases,
  startDate,
  goalEvents,
  primaryGoalEvent,
  selectedWeek,
  onSelectWeek,
}: WeeklyVolumeChartProps) {
  const displayWeeks = Math.max(weeks.length, 1);
  const maxHours = useMemo(
    () => Math.max(...weeks.map((week) => week.totalHours), 1),
    [weeks]
  );

  const seasonStart = useMemo(() => parseDateKey(startDate), [startDate]);

  const monthTicks = useMemo(
    () => monthTicksForWeeks(seasonStart, displayWeeks),
    [displayWeeks, seasonStart]
  );

  const raceMarkers = useMemo(() => {
    const events = goalEventsForRaceMarkers(primaryGoalEvent, goalEvents);
    return buildRaceMarkersFromGoalEvents(seasonStart, displayWeeks, events);
  }, [goalEvents, displayWeeks, primaryGoalEvent, seasonStart]);

  const { tooltip, handlers } = useChartHoverTooltip();

  if (weeks.length === 0) {
    return <p className="text-sm text-zinc-500">No weekly volume data.</p>;
  }

  return (
    <div className="space-y-2">
      <RaceMarkerOverlay markers={raceMarkers} />

      <div className="flex h-32 items-stretch gap-0.5">
        {weeks.map((week) => {
          const phase = phaseForWeekIndex(phases, week.weekIndex);
          const heightPct = (week.totalHours / maxHours) * 100;
          const barTooltip = weekBarTooltip(week);
          return (
            <button
              key={week.weekIndex}
              type="button"
              onClick={() => onSelectWeek(week.weekIndex)}
              className={`flex min-w-0 flex-1 flex-col justify-end ${
                selectedWeek === week.weekIndex ? "ring-2 ring-sky-500 ring-offset-1" : ""
              }`}
              {...handlers(barTooltip)}
            >
              <div
                className={`w-full rounded-t transition-opacity ${
                  week.isDeLoadWeek ? "opacity-60" : ""
                }`}
                style={{
                  height: `${Math.max(heightPct, 2)}%`,
                  backgroundColor: phase?.color ?? "#38bdf8",
                }}
              />
            </button>
          );
        })}
      </div>

      <ChartHoverTooltipLayer tooltip={tooltip} />

      <SeasonMonthTicks ticks={monthTicks} displayWeeks={displayWeeks} />

      <p className="text-xs text-zinc-500">
        Click a bar to inspect that week. Shaded bars are de-load weeks. Hover for week start
        date and volume.
      </p>
    </div>
  );
}

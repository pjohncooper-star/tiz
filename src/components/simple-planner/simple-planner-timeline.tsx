"use client";

import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { parseDateKey } from "@/lib/dates";
import {
  buildRaceMarkersFromGoalEvents,
  goalEventsForRaceMarkers,
} from "@/lib/plan/season/preview-race-markers";
import { monthTicksForWeeks } from "@/lib/plan/season/season-dates";
import { isAssignedPhase, phaseForWeekIndex } from "@/lib/plan/season/phase-span-utils";
import type { SimpleGoalEvent, SimplePhase, SimpleWeek } from "./simple-planner-types";

const DISCIPLINE_COLORS = {
  swim: "#38bdf8",
  bike: "#f59e0b",
  run: "#22c55e",
} as const;

type DisciplineKey = keyof typeof DISCIPLINE_COLORS;
type FocusMode = "all" | DisciplineKey;

const TIMELINE_COLLAPSE_KEY = "simple-planner-timeline-collapsed";

type SimplePlannerTimelineProps = {
  seasonStart: string;
  weeks: SimpleWeek[];
  phases: SimplePhase[];
  goalEvents: SimpleGoalEvent[];
  primaryGoalEvent: SimpleGoalEvent | null;
  selectedWeekIndex: number | null;
  onSelectWeek: (weekIndex: number) => void;
  sticky?: boolean;
  previewHint?: string | null;
};

function readCollapsedDefault(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(TIMELINE_COLLAPSE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // ignore
  }
  return window.matchMedia("(max-width: 767px)").matches;
}

export function SimplePlannerTimeline({
  seasonStart,
  weeks,
  phases,
  goalEvents,
  primaryGoalEvent,
  selectedWeekIndex,
  onSelectWeek,
  sticky = false,
  previewHint = null,
}: SimplePlannerTimelineProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [focus, setFocus] = useState<FocusMode>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsedDefault());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(TIMELINE_COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, hydrated]);

  const startDate = parseDateKey(seasonStart);
  const displayWeeks = Math.max(weeks.length, 1);

  const maxHours = useMemo(() => {
    if (focus === "all") {
      return Math.max(...weeks.map((week) => week.totalHours), 1);
    }
    const key =
      focus === "swim" ? "swimHours" : focus === "bike" ? "bikeHours" : "runHours";
    return Math.max(...weeks.map((week) => week[key]), 0.25);
  }, [focus, weeks]);

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

  const assignedPhases = useMemo(() => phases.filter(isAssignedPhase), [phases]);

  const chart = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            aria-expanded={!collapsed}
          >
            {collapsed ? "Show volume" : "Hide volume"}
          </button>
          {!collapsed && (
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["swim", "Swim"],
                  ["bike", "Bike"],
                  ["run", "Run"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFocus(key)}
                  className={`rounded px-2 py-1 text-xs font-medium ${
                    focus === key
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {previewHint ? (
          <p className="text-[11px] text-zinc-500">{previewHint}</p>
        ) : null}
      </div>

      {collapsed ? (
        <CollapsedSparkline
          weeks={weeks}
          maxHours={Math.max(...weeks.map((w) => w.totalHours), 1)}
          selectedWeekIndex={selectedWeekIndex}
          onSelectWeek={onSelectWeek}
          phases={phases}
        />
      ) : (
        <>
          <div className="relative h-28">
            <div className="absolute inset-x-0 bottom-6 flex h-20 items-end gap-0.5">
              {weeks.map((week) => {
                const selected = selectedWeekIndex === week.weekIndex;
                const prior = weeks[week.weekIndex - 1];
                const delta =
                  prior && !week.isRestWeek && !prior.isRestWeek
                    ? week.totalHours - prior.totalHours
                    : null;
                const title = weekTooltip(week, delta);
                return (
                  <button
                    key={week.weekIndex}
                    type="button"
                    onClick={() => onSelectWeek(week.weekIndex)}
                    className={`relative flex min-w-0 flex-1 flex-col justify-end rounded-t transition ${
                      selected ? "ring-2 ring-sky-500 ring-offset-1" : ""
                    } ${week.isRestWeek ? "opacity-50" : ""}`}
                    style={{ height: "100%" }}
                    title={title}
                  >
                    {focus === "all" ? (
                      <StackedBar week={week} maxHours={maxHours} />
                    ) : (
                      <SingleBar
                        value={
                          focus === "swim"
                            ? week.swimHours
                            : focus === "bike"
                              ? week.bikeHours
                              : week.runHours
                        }
                        maxHours={maxHours}
                        color={DISCIPLINE_COLORS[focus]}
                        phaseTint={phaseForWeekIndex(phases, week.weekIndex)?.color}
                      />
                    )}
                  </button>
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

          {focus === "all" && (
            <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-wide text-zinc-500">
              <LegendSwatch color={DISCIPLINE_COLORS.swim} label="Swim" />
              <LegendSwatch color={DISCIPLINE_COLORS.bike} label="Bike" />
              <LegendSwatch color={DISCIPLINE_COLORS.run} label="Run" />
            </div>
          )}

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
            {assignedPhases.map((phase) => {
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
        </>
      )}
    </div>
  );

  if (!sticky) return chart;

  return (
    <div className="sticky top-0 z-20 -mx-1 border-b border-zinc-200 bg-white/95 px-1 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:top-0">
      {chart}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function StackedBar({ week, maxHours }: { week: SimpleWeek; maxHours: number }) {
  const total = Math.max(week.totalHours, 0);
  const heightPct = Math.max((total / maxHours) * 100, total > 0 ? 4 : 0);
  const swimPct = total > 0 ? (week.swimHours / total) * 100 : 0;
  const bikePct = total > 0 ? (week.bikeHours / total) * 100 : 0;
  const runPct = total > 0 ? (week.runHours / total) * 100 : 0;

  return (
    <div
      className="flex w-full flex-col-reverse overflow-hidden rounded-t"
      style={{ height: `${heightPct}%` }}
    >
      <div style={{ height: `${swimPct}%`, backgroundColor: DISCIPLINE_COLORS.swim }} />
      <div style={{ height: `${bikePct}%`, backgroundColor: DISCIPLINE_COLORS.bike }} />
      <div style={{ height: `${runPct}%`, backgroundColor: DISCIPLINE_COLORS.run }} />
    </div>
  );
}

function SingleBar({
  value,
  maxHours,
  color,
  phaseTint,
}: {
  value: number;
  maxHours: number;
  color: string;
  phaseTint?: string;
}) {
  const heightPct = Math.max((value / maxHours) * 100, value > 0 ? 4 : 0);
  return (
    <div
      className="w-full rounded-t"
      style={{
        height: `${heightPct}%`,
        backgroundColor: color,
        boxShadow: phaseTint ? `inset 0 -2px 0 ${phaseTint}` : undefined,
      }}
    />
  );
}

function CollapsedSparkline({
  weeks,
  maxHours,
  selectedWeekIndex,
  onSelectWeek,
  phases,
}: {
  weeks: SimpleWeek[];
  maxHours: number;
  selectedWeekIndex: number | null;
  onSelectWeek: (weekIndex: number) => void;
  phases: SimplePhase[];
}) {
  return (
    <div className="flex h-8 items-end gap-px">
      {weeks.map((week) => {
        const heightPx = Math.max((week.totalHours / maxHours) * 32, 3);
        const selected = selectedWeekIndex === week.weekIndex;
        return (
          <button
            key={week.weekIndex}
            type="button"
            onClick={() => onSelectWeek(week.weekIndex)}
            className={`min-w-0 flex-1 rounded-t ${selected ? "ring-1 ring-sky-500" : ""} ${
              week.isRestWeek ? "opacity-40" : ""
            }`}
            style={{
              height: `${heightPx}px`,
              backgroundColor: phaseForWeekIndex(phases, week.weekIndex)?.color ?? "#94a3b8",
            }}
            title={`W${week.weekIndex + 1}: ${week.totalHours}h`}
          />
        );
      })}
    </div>
  );
}

function weekTooltip(week: SimpleWeek, delta: number | null): string {
  const parts = [
    `W${week.weekIndex + 1}: ${week.totalHours}h total`,
    `Swim ${week.swimHours}h · Bike ${week.bikeHours}h · Run ${week.runHours}h`,
  ];
  if (delta != null) {
    const sign = delta >= 0 ? "+" : "";
    parts.push(`Δ ${sign}${delta.toFixed(2)}h vs prior`);
  }
  if (week.isRestWeek) parts.push("Rest week");
  return parts.join("\n");
}

export function formatWeekDateRange(weekStartDate: string): string {
  const start = parseISO(`${weekStartDate}T12:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

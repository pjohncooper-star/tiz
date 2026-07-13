"use client";

import { useMemo } from "react";
import type { Discipline, SignalType } from "@prisma/client";
import {
  buildWorkoutProfile,
  defaultPrimarySignalForDiscipline,
  type ProfileLengthView,
} from "@/lib/workout/workout-profile";
import type { WorkoutNode } from "@/lib/workout/workout-tree";
import type { DisplayUnit } from "@/lib/workout/metrics";

type WorkoutProfileChartProps = {
  nodes: WorkoutNode[];
  discipline: Discipline;
  lengthView: ProfileLengthView;
  primarySignal?: SignalType | null;
  displayUnit?: DisplayUnit;
  thresholdPaceSeconds?: number | null;
  thresholdFtpWatts?: number | null;
  thresholdHrBpm?: number | null;
  /** ~half plot height for constrained layouts (e.g. calendar Build panel). */
  compact?: boolean;
};

const PLOT_HEIGHT = 128;
const PLOT_HEIGHT_COMPACT = 64;
const MARGIN_LEFT = 52;
const MARGIN_RIGHT = 8;
const MARGIN_TOP = 8;
const MARGIN_BOTTOM = 24;
const MARGIN_TOP_COMPACT = 4;
const MARGIN_BOTTOM_COMPACT = 16;

export function WorkoutProfileChart({
  nodes,
  discipline,
  lengthView,
  primarySignal = null,
  displayUnit = "METRIC",
  thresholdPaceSeconds = null,
  thresholdFtpWatts = null,
  thresholdHrBpm = null,
  compact = false,
}: WorkoutProfileChartProps) {
  const ySignal = primarySignal ?? defaultPrimarySignalForDiscipline(discipline);

  const profile = useMemo(
    () =>
      buildWorkoutProfile(nodes, {
        primarySignal: ySignal,
        lengthView,
        discipline,
        displayUnit,
        thresholds: {
          thresholdPaceSeconds,
          thresholdFtpWatts,
          thresholdHrBpm,
        },
      }),
    [
      nodes,
      ySignal,
      lengthView,
      discipline,
      displayUnit,
      thresholdPaceSeconds,
      thresholdFtpWatts,
      thresholdHrBpm,
    ]
  );

  if (profile.segments.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Add steps with {lengthView === "distance" ? "distance" : "duration"} to see the workout
        profile.
      </p>
    );
  }

  const plotHeight = compact ? PLOT_HEIGHT_COMPACT : PLOT_HEIGHT;
  const marginTop = compact ? MARGIN_TOP_COMPACT : MARGIN_TOP;
  const marginBottom = compact ? MARGIN_BOTTOM_COMPACT : MARGIN_BOTTOM;
  const plotWidth = 640;
  const width = MARGIN_LEFT + plotWidth + MARGIN_RIGHT;
  const height = marginTop + plotHeight + marginBottom;
  const { yMin, yMax, totalX } = profile;

  const plotBottom = marginTop + plotHeight;

  function xToPx(x: number): number {
    return MARGIN_LEFT + (x / totalX) * plotWidth;
  }

  function yToPx(y: number): number {
    const t = (y - yMin) / (yMax - yMin || 1);
    return marginTop + plotHeight - t * plotHeight;
  }

  const yTicks = compact ? 2 : 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);
  const xTickValues = [0, totalX * 0.25, totalX * 0.5, totalX * 0.75, totalX];

  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/50 ${
        compact ? "p-2" : "p-3"
      }`}
    >
      <div className={`flex items-center justify-between gap-2 ${compact ? "mb-1" : "mb-2"}`}>
        <p className="text-xs font-medium text-zinc-500">Workout profile</p>
        <p className="text-[10px] text-zinc-400">
          {profile.xLabel} × {profile.yLabel}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Workout intensity profile"
      >
        {yTickValues.map((tick) => {
          const y = yToPx(tick);
          return (
            <g key={`y-${tick}`}>
              <line
                x1={MARGIN_LEFT}
                y1={y}
                x2={MARGIN_LEFT + plotWidth}
                y2={y}
                stroke="currentColor"
                className="text-zinc-200 dark:text-zinc-700"
                strokeDasharray="4 4"
              />
              <text
                x={MARGIN_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-zinc-500 text-[10px]"
              >
                {profile.formatY(tick)}
              </text>
            </g>
          );
        })}

        {profile.segments.map((seg) => {
          const x = xToPx(seg.x);
          const w = Math.max(xToPx(seg.x + seg.width) - x, 1);
          const yTop = yToPx(seg.yHigh);
          const isRange = Math.abs(seg.yHigh - seg.yLow) > 1e-9;
          const yBottom = isRange ? yToPx(seg.yLow) : plotBottom;
          const barHeight = Math.max(yBottom - yTop, 1);
          return (
            <rect
              key={seg.id}
              x={x}
              y={yTop}
              width={w}
              height={barHeight}
              fill={seg.fill}
              opacity={0.92}
              rx={1}
            >
              <title>
                {seg.label}: {profile.formatY((seg.yLow + seg.yHigh) / 2)} ·{" "}
                {profile.formatX(seg.width)}
              </title>
            </rect>
          );
        })}

        <line
          x1={MARGIN_LEFT}
          y1={marginTop + plotHeight}
          x2={MARGIN_LEFT + plotWidth}
          y2={marginTop + plotHeight}
          stroke="currentColor"
          className="text-zinc-300 dark:text-zinc-600"
        />
        <line
          x1={MARGIN_LEFT}
          y1={marginTop}
          x2={MARGIN_LEFT}
          y2={marginTop + plotHeight}
          stroke="currentColor"
          className="text-zinc-300 dark:text-zinc-600"
        />

        {xTickValues.map((tick) => {
          const x = xToPx(tick);
          return (
            <text
              key={`x-${tick}`}
              x={x}
              y={height - 6}
              textAnchor="middle"
              className="fill-zinc-500 text-[10px]"
            >
              {profile.formatX(tick)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

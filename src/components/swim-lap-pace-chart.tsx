"use client";

import { useMemo, useState } from "react";
import type { SwimLapInterval } from "@/lib/zones/swim-laps";
import { formatPace } from "@/lib/units/pace";

type SwimLapPaceChartProps = {
  laps: SwimLapInterval[];
  displayUnit: "METRIC" | "IMPERIAL";
};

type ChartRow = SwimLapInterval & {
  chartPace: number;
  paceLabel: string;
  timeLabel: string;
  durationLabel: string;
};

const VIEW_W = 720;
const VIEW_H = 260;
const MARGIN = { top: 12, right: 16, bottom: 36, left: 48 };

function formatClockTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
  return `${s}s`;
}

function toDisplayPace(
  paceSecPer100m: number,
  displayUnit: "METRIC" | "IMPERIAL"
): number {
  if (displayUnit === "METRIC") return paceSecPer100m;
  return paceSecPer100m * (100 / 91.44);
}

function paceUnitLabel(displayUnit: "METRIC" | "IMPERIAL"): string {
  return displayUnit === "METRIC" ? "min/100m" : "min/100yd";
}

function buildRows(
  laps: SwimLapInterval[],
  displayUnit: "METRIC" | "IMPERIAL"
): ChartRow[] {
  const unit = displayUnit === "METRIC" ? "100m" : "100yd";
  const activePaces = laps
    .filter((l) => !l.isRest && l.paceSecPer100m != null)
    .map((l) => toDisplayPace(l.paceSecPer100m!, displayUnit));

  const restHeight =
    activePaces.length > 0 ? Math.min(...activePaces) * 0.12 : 10;

  return laps.map((lap) => {
    const durationLabel = formatDuration(lap.durationSec);
    const timeLabel = `${formatClockTime(lap.startSec)}–${formatClockTime(lap.endSec)}`;
    if (lap.isRest || lap.paceSecPer100m == null) {
      return {
        ...lap,
        chartPace: restHeight,
        paceLabel: "Rest",
        timeLabel,
        durationLabel,
      };
    }
    return {
      ...lap,
      chartPace: toDisplayPace(lap.paceSecPer100m, displayUnit),
      paceLabel: formatPace(lap.paceSecPer100m, unit),
      timeLabel,
      durationLabel,
    };
  });
}

function paceTickLabel(
  sec: number,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (sec <= 0) return "";
  return formatPace(
    displayUnit === "METRIC" ? sec : sec * (91.44 / 100),
    displayUnit === "METRIC" ? "100m" : "100yd"
  );
}

export function SwimLapPaceChart({
  laps,
  displayUnit,
}: SwimLapPaceChartProps) {
  const rows = useMemo(() => buildRows(laps, displayUnit), [laps, displayUnit]);
  const [hovered, setHovered] = useState<ChartRow | null>(null);

  const plotW = VIEW_W - MARGIN.left - MARGIN.right;
  const plotH = VIEW_H - MARGIN.top - MARGIN.bottom;
  const activePaces = rows.filter((r) => !r.isRest).map((r) => r.chartPace);
  const yMax =
    activePaces.length > 0
      ? Math.ceil(Math.max(...activePaces) * 1.08)
      : 120;
  const xMax = Math.ceil(Math.max(...rows.map((r) => r.endSec)) * 1.02);

  const px = (sec: number) => MARGIN.left + (sec / xMax) * plotW;
  const py = (pace: number) => MARGIN.top + (pace / yMax) * plotH;
  const yBase = MARGIN.top + plotH;

  const xTicks = useMemo(() => {
    const step = xMax > 1800 ? 600 : xMax > 900 ? 300 : 120;
    const ticks: number[] = [];
    for (let t = 0; t <= xMax; t += step) ticks.push(t);
    return ticks;
  }, [xMax]);

  const yTicks = useMemo(() => {
    const step = yMax > 150 ? 30 : 15;
    const ticks: number[] = [];
    for (let t = 0; t <= yMax; t += step) ticks.push(t);
    return ticks;
  }, [yMax]);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-72 w-full"
        role="img"
        aria-label="Swim lap pace chart"
      >
        <g className="stroke-zinc-200 dark:stroke-zinc-800">
          {xTicks.map((t) => (
            <line
              key={`xg-${t}`}
              x1={px(t)}
              y1={MARGIN.top}
              x2={px(t)}
              y2={yBase}
              strokeDasharray="3 3"
            />
          ))}
          {yTicks.map((t) => (
            <line
              key={`yg-${t}`}
              x1={MARGIN.left}
              y1={py(t)}
              x2={MARGIN.left + plotW}
              y2={py(t)}
              strokeDasharray="3 3"
            />
          ))}
        </g>

        {rows.map((row) => {
          const x = px(row.startSec);
          const width = Math.max(px(row.endSec) - x, 2);
          const top = py(row.chartPace);
          const height = Math.max(yBase - top, row.isRest ? 4 : 2);
          return (
            <rect
              key={row.index}
              x={x}
              y={top}
              width={width}
              height={height}
              fill={row.isRest ? "#a1a1aa" : "#0ea5e9"}
              fillOpacity={row.isRest ? 0.55 : 0.9}
              rx={2}
              onMouseEnter={() => setHovered(row)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}

        {xTicks.map((t) => (
          <text
            key={`xt-${t}`}
            x={px(t)}
            y={VIEW_H - 10}
            textAnchor="middle"
            className="fill-zinc-500 text-[10px]"
          >
            {formatClockTime(t)}
          </text>
        ))}
        {yTicks.map((t) => (
          <text
            key={`yt-${t}`}
            x={MARGIN.left - 6}
            y={py(t) + 3}
            textAnchor="end"
            className="fill-zinc-500 text-[10px]"
          >
            {paceTickLabel(t, displayUnit)}
          </text>
        ))}

        <text
          x={MARGIN.left + plotW / 2}
          y={VIEW_H - 22}
          textAnchor="middle"
          className="fill-zinc-500 text-[11px]"
        >
          Time
        </text>
        <text
          x={14}
          y={MARGIN.top + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${MARGIN.top + plotH / 2})`}
          className="fill-zinc-500 text-[11px]"
        >
          Pace ({paceUnitLabel(displayUnit)})
        </text>
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium">
            Lap {hovered.index}
            {hovered.isRest ? " · Rest" : ""}
          </p>
          <p className="text-zinc-500">Time: {hovered.timeLabel}</p>
          <p className="text-zinc-500">Duration: {hovered.durationLabel}</p>
          <p className="text-zinc-500">
            Pace: {hovered.isRest ? "—" : hovered.paceLabel}{" "}
            {hovered.isRest ? "" : paceUnitLabel(displayUnit)}
          </p>
        </div>
      )}

      <p className="mt-1 text-center text-xs text-zinc-500">
        Bar width = lap duration · faster pace is higher · gray = rest
      </p>
    </div>
  );
}

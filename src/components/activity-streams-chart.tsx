"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "@/components/ui";
import type {
  ActivityStreamPoint,
  BikeStreamMetrics,
  ChartDiscipline,
  RunStreamMetrics,
  StreamMetrics,
} from "@/lib/activity/record-streams";
import {
  distanceUnitLabel,
  distanceXValue,
  formatChartPace,
  formatStreamDistance,
  formatStreamTime,
  paceUnitLabel,
  speedUnitLabel,
} from "@/lib/activity/record-streams";
import type { WorkoutAnalysisOverlay } from "@/lib/activity/workout-analysis-overlay";
import {
  findLapRegionAtTime,
  findStepRegionAtTime,
} from "@/lib/activity/workout-analysis-overlay";

type XAxisMode = "time" | "distance";

type ActivityStreamsChartProps = {
  points: ActivityStreamPoint[];
  displayUnit: "METRIC" | "IMPERIAL";
  discipline: ChartDiscipline;
  available: StreamMetrics;
  overlay?: WorkoutAnalysisOverlay | null;
};

type ChartRow = ActivityStreamPoint & {
  x: number;
};

type MetricKey = keyof BikeStreamMetrics | keyof RunStreamMetrics;

type MetricConfig = {
  key: MetricKey;
  label: string;
  color: string;
  dataKey: keyof ActivityStreamPoint;
  yAxisId: string;
  axisLabel: string;
  reversed?: boolean;
};

const BIKE_METRICS: MetricConfig[] = [
  {
    key: "power",
    label: "Power",
    color: "#f97316",
    dataKey: "power",
    yAxisId: "power",
    axisLabel: "W",
  },
  {
    key: "heartRate",
    label: "Heart rate",
    color: "#ef4444",
    dataKey: "heartRate",
    yAxisId: "heartRate",
    axisLabel: "bpm",
  },
  {
    key: "cadence",
    label: "Cadence",
    color: "#8b5cf6",
    dataKey: "cadence",
    yAxisId: "cadence",
    axisLabel: "rpm",
  },
  {
    key: "speed",
    label: "Speed",
    color: "#0ea5e9",
    dataKey: "speed",
    yAxisId: "speed",
    axisLabel: "",
  },
];

const RUN_METRICS: MetricConfig[] = [
  {
    key: "pace",
    label: "Pace",
    color: "#0ea5e9",
    dataKey: "pace",
    yAxisId: "pace",
    axisLabel: "",
    reversed: true,
  },
  {
    key: "cadence",
    label: "Cadence",
    color: "#8b5cf6",
    dataKey: "cadence",
    yAxisId: "cadence",
    axisLabel: "spm",
  },
  {
    key: "heartRate",
    label: "Heart rate",
    color: "#ef4444",
    dataKey: "heartRate",
    yAxisId: "heartRate",
    axisLabel: "bpm",
  },
];

const LAP_FILLS = ["#a1a1aa18", "#71717a12"];

function initialVisibility(
  discipline: ChartDiscipline,
  available: StreamMetrics
): Record<string, boolean> {
  if (discipline === "BIKE") {
    const a = available as BikeStreamMetrics;
    return {
      power: a.power,
      heartRate: a.heartRate,
      cadence: a.cadence,
      speed: a.speed,
    };
  }
  const a = available as RunStreamMetrics;
  return {
    pace: a.pace,
    cadence: a.cadence,
    heartRate: a.heartRate,
  };
}

function profileYToChartAxis(
  yLow: number,
  yHigh: number,
  ghostYAxisId: WorkoutAnalysisOverlay["ghostYAxisId"]
): { y1: number; y2: number } {
  if (ghostYAxisId === "pace") {
    const a = Math.abs(yLow);
    const b = Math.abs(yHigh);
    return { y1: Math.min(a, b), y2: Math.max(a, b) };
  }
  return { y1: Math.min(yLow, yHigh), y2: Math.max(yLow, yHigh) };
}

function formatTargetRange(
  step: WorkoutAnalysisOverlay["stepRegions"][number],
  ghostYAxisId: WorkoutAnalysisOverlay["ghostYAxisId"],
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  const { y1, y2 } = profileYToChartAxis(step.yLow, step.yHigh, ghostYAxisId);
  if (ghostYAxisId === "power") {
    if (Math.abs(y1 - y2) < 1) return `${Math.round(y1)} W`;
    return `${Math.round(y1)}–${Math.round(y2)} W`;
  }
  if (ghostYAxisId === "pace") {
    if (Math.abs(y1 - y2) < 1) {
      return `${formatChartPace(y1, displayUnit)} ${paceUnitLabel(displayUnit)}`;
    }
    return `${formatChartPace(y1, displayUnit)}–${formatChartPace(y2, displayUnit)} ${paceUnitLabel(displayUnit)}`;
  }
  if (Math.abs(y1 - y2) < 0.1) return `${Math.round(y1)} bpm`;
  return `${Math.round(y1)}–${Math.round(y2)} bpm`;
}

function lapAverages(
  points: ActivityStreamPoint[],
  lap: { startSec: number; endSec: number },
  metrics: MetricConfig[],
  visible: Record<string, boolean>
): Array<{ label: string; value: string; color: string }> {
  const inLap = points.filter(
    (p) => p.timeSec >= lap.startSec && p.timeSec < lap.endSec
  );
  if (inLap.length === 0) return [];

  const rows: Array<{ label: string; value: string; color: string }> = [];
  for (const cfg of metrics) {
    if (!visible[cfg.key]) continue;
    const vals = inLap
      .map((p) => p[cfg.dataKey])
      .filter((v): v is number => typeof v === "number" && v > 0);
    if (vals.length === 0) continue;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    if (cfg.key === "power") {
      rows.push({ label: `${cfg.label} avg`, value: `${Math.round(avg)} W`, color: cfg.color });
    } else if (cfg.key === "heartRate") {
      rows.push({ label: `${cfg.label} avg`, value: `${Math.round(avg)} bpm`, color: cfg.color });
    } else if (cfg.key === "pace") {
      rows.push({
        label: `${cfg.label} avg`,
        value: `${formatChartPace(avg, "METRIC")}`,
        color: cfg.color,
      });
    } else if (cfg.key === "speed") {
      rows.push({ label: `${cfg.label} avg`, value: `${avg.toFixed(1)}`, color: cfg.color });
    } else if (cfg.key === "cadence") {
      rows.push({ label: `${cfg.label} avg`, value: `${Math.round(avg)}`, color: cfg.color });
    }
  }
  return rows;
}

function MetricToggle({
  label,
  color,
  active,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "border-zinc-300 bg-white shadow-sm dark:border-zinc-600 dark:bg-zinc-800"
          : "border-transparent text-zinc-400 line-through dark:text-zinc-500"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: active ? color : "#a1a1aa" }}
      />
      {label}
    </button>
  );
}

function OverlayToggle({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
        active
          ? "border-zinc-300 bg-white text-zinc-700 shadow-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
          : "border-transparent text-zinc-400 dark:text-zinc-500"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );
}

function formatMetricValue(
  cfg: MetricConfig,
  row: ChartRow,
  displayUnit: "METRIC" | "IMPERIAL"
): string | null {
  const val = row[cfg.dataKey];
  if (val == null || typeof val !== "number") return null;

  if (cfg.key === "power") return `${Math.round(val)} W`;
  if (cfg.key === "cadence") {
    return `${Math.round(val)} ${cfg.axisLabel}`;
  }
  if (cfg.key === "speed") {
    return `${val.toFixed(1)} ${speedUnitLabel(displayUnit)}`;
  }
  if (cfg.key === "pace") {
    return `${formatChartPace(val, displayUnit)} ${paceUnitLabel(displayUnit)}`;
  }
  if (cfg.key === "heartRate") return `${Math.round(val)} bpm`;
  return String(val);
}

function ChartTooltip({
  active,
  payload,
  displayUnit,
  metrics,
  visible,
  overlay,
  points,
  showTargets,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  displayUnit: "METRIC" | "IMPERIAL";
  metrics: MetricConfig[];
  visible: Record<string, boolean>;
  overlay?: WorkoutAnalysisOverlay | null;
  points: ActivityStreamPoint[];
  showTargets: boolean;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  const lap = overlay ? findLapRegionAtTime(overlay.lapRegions, row.timeSec) : null;
  const step = overlay ? findStepRegionAtTime(overlay.stepRegions, row.timeSec) : null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs shadow dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-200">
        {formatStreamTime(row.timeSec)}
        {row.distanceM > 0 && (
          <span className="ml-2 font-normal text-zinc-500">
            · {formatStreamDistance(row.distanceM, displayUnit)}
          </span>
        )}
      </p>
      {step && (
        <p className="mb-1 text-zinc-600 dark:text-zinc-300">
          {step.groupLabel ? `${step.groupLabel} · ` : ""}
          {step.label}
        </p>
      )}
      {showTargets && step && overlay && (
        <p className="mb-1 text-zinc-500">
          Target: {formatTargetRange(step, overlay.ghostYAxisId, displayUnit)}
        </p>
      )}
      {metrics.map((cfg) => {
        if (!visible[cfg.key]) return null;
        const text = formatMetricValue(cfg, row, displayUnit);
        if (!text) return null;
        return (
          <p key={cfg.key} style={{ color: cfg.color }}>
            {cfg.label}: {text}
          </p>
        );
      })}
      {lap &&
        lapAverages(points, lap, metrics, visible).map((avg) => (
          <p key={avg.label} className="text-zinc-500" style={{ color: avg.color }}>
            {avg.label}: {avg.value}
          </p>
        ))}
    </div>
  );
}

function paceAxisTick(sec: number, displayUnit: "METRIC" | "IMPERIAL"): string {
  if (sec <= 0) return "";
  return formatChartPace(sec, displayUnit);
}

export function ActivityStreamsChart({
  points,
  displayUnit,
  discipline,
  available,
  overlay,
}: ActivityStreamsChartProps) {
  const metrics = discipline === "BIKE" ? BIKE_METRICS : RUN_METRICS;
  const hasDistance = points.some((p) => p.distanceM > 0);
  const hasOverlay = !!overlay && overlay.stepRegions.length > 0;

  const [xMode, setXMode] = useState<XAxisMode>("time");
  const [visible, setVisible] = useState(() =>
    initialVisibility(discipline, available)
  );
  const [showLaps, setShowLaps] = useState(true);
  const [showTargets, setShowTargets] = useState(true);
  const [showGhost, setShowGhost] = useState(true);

  const chartData = useMemo<ChartRow[]>(
    () =>
      points.map((p) => ({
        ...p,
        x:
          xMode === "time"
            ? p.timeSec
            : distanceXValue(p.distanceM, displayUnit),
      })),
    [points, xMode, displayUnit]
  );

  const ghostLineData = useMemo(() => {
    if (!overlay || !showGhost) return [];
    return overlay.ghostPoints.map((p) => ({
      x: xMode === "time" ? p.xTime : p.xDistance,
      y: p.y,
    }));
  }, [overlay, showGhost, xMode]);

  const xMax = useMemo(() => {
    const values = [
      ...chartData.map((p) => p.x),
      ...ghostLineData.map((p) => p.x),
    ];
    return Math.max(0, ...values) * 1.01;
  }, [chartData, ghostLineData]);

  const activeMetrics = metrics.filter(
    (cfg) => visible[cfg.key] && (available as Record<string, boolean>)[cfg.key]
  );

  const leftMetric = activeMetrics.find(
    (m) => m.key === "power" || m.key === "pace"
  );
  const rightMetrics = activeMetrics.filter((m) => m !== leftMetric);

  const ghostYAxisId = overlay?.ghostYAxisId ?? "power";
  const ghostOnLeft =
    leftMetric?.yAxisId === ghostYAxisId ||
    (!leftMetric && ghostYAxisId === "power");
  const ghostAxisId = ghostOnLeft
    ? leftMetric?.yAxisId ?? ghostYAxisId
    : rightMetrics.find((m) => m.yAxisId === ghostYAxisId)?.yAxisId ?? ghostYAxisId;

  const marginLeft = leftMetric ? 48 : 4;
  const marginRight = 8 + rightMetrics.length * 44;

  function toggleMetric(key: string) {
    if (!(available as Record<string, boolean>)[key]) return;
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const anyOn = metrics.some((m) => next[m.key]);
      if (!anyOn) return { ...prev, [key]: true };
      return next;
    });
  }

  function axisLabel(cfg: MetricConfig): string {
    if (cfg.key === "speed") return speedUnitLabel(displayUnit);
    if (cfg.key === "pace") return paceUnitLabel(displayUnit);
    return cfg.axisLabel;
  }

  function regionX(
    startTimeSec: number,
    endTimeSec: number,
    startDistanceM: number,
    endDistanceM: number
  ): { x1: number; x2: number } {
    if (xMode === "time") {
      return { x1: startTimeSec, x2: endTimeSec };
    }
    return {
      x1: distanceXValue(startDistanceM, displayUnit),
      x2: distanceXValue(endDistanceM, displayUnit),
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {metrics.map((cfg) => (
            <MetricToggle
              key={cfg.key}
              label={cfg.label}
              color={cfg.color}
              active={!!visible[cfg.key]}
              disabled={!(available as Record<string, boolean>)[cfg.key]}
              onClick={() => toggleMetric(cfg.key)}
            />
          ))}
        </div>
        <SegmentedControl
          value={xMode}
          onChange={setXMode}
          options={[
            { value: "time" as const, label: "Time" },
            ...(hasDistance
              ? [{ value: "distance" as const, label: "Distance" }]
              : []),
          ]}
        />
      </div>

      {hasOverlay && (
        <div className="flex flex-wrap gap-1">
          <OverlayToggle
            label="Laps"
            active={showLaps}
            onClick={() => setShowLaps((v) => !v)}
          />
          <OverlayToggle
            label="Targets"
            active={showTargets}
            onClick={() => setShowTargets((v) => !v)}
          />
          <OverlayToggle
            label="Planned"
            active={showGhost}
            onClick={() => setShowGhost((v) => !v)}
          />
        </div>
      )}

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: marginRight, left: marginLeft, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-zinc-200 dark:stroke-zinc-800"
            />
            {showLaps &&
              overlay?.lapRegions.map((lap, i) => {
                const { x1, x2 } = regionX(
                  lap.startSec,
                  lap.endSec,
                  lap.startDistanceM,
                  lap.endDistanceM
                );
                return (
                  <ReferenceArea
                    key={`lap-${lap.index}`}
                    x1={x1}
                    x2={x2}
                    fill={LAP_FILLS[i % LAP_FILLS.length]}
                    strokeOpacity={0}
                    ifOverflow="extendDomain"
                  />
                );
              })}
            {showTargets &&
              overlay?.stepRegions.map((step) => {
                const { x1, x2 } = regionX(
                  step.startTimeSec,
                  step.endTimeSec,
                  step.startDistanceM,
                  step.endDistanceM
                );
                const { y1, y2 } = profileYToChartAxis(
                  step.yLow,
                  step.yHigh,
                  overlay.ghostYAxisId
                );
                return (
                  <ReferenceArea
                    key={`step-${step.index}`}
                    x1={x1}
                    x2={x2}
                    y1={y1}
                    y2={y2}
                    yAxisId={ghostAxisId}
                    fill={step.fill}
                    fillOpacity={0.15}
                    strokeOpacity={0}
                    ifOverflow="hidden"
                  />
                );
              })}
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, xMax]}
              tickFormatter={(v) =>
                xMode === "time"
                  ? formatStreamTime(Number(v))
                  : `${Number(v).toFixed(1)}`
              }
              tick={{ fontSize: 10 }}
              label={{
                value:
                  xMode === "time"
                    ? "Time"
                    : `Distance (${distanceUnitLabel(displayUnit)})`,
                position: "insideBottom",
                offset: -2,
                className: "fill-zinc-500 text-xs",
              }}
            />
            {leftMetric && (
              <YAxis
                yAxisId={leftMetric.yAxisId}
                orientation="left"
                reversed={leftMetric.reversed}
                tick={{ fontSize: 10 }}
                width={44}
                stroke={leftMetric.color}
                tickFormatter={
                  leftMetric.key === "pace"
                    ? (v) => paceAxisTick(Number(v), displayUnit)
                    : undefined
                }
                label={{
                  value: axisLabel(leftMetric),
                  angle: -90,
                  position: "insideLeft",
                  className: "fill-zinc-500 text-xs",
                }}
              />
            )}
            {rightMetrics.map((cfg, i) => (
              <YAxis
                key={cfg.yAxisId}
                yAxisId={cfg.yAxisId}
                orientation="right"
                reversed={cfg.reversed}
                tick={{ fontSize: 10 }}
                width={40}
                stroke={cfg.color}
                tickFormatter={
                  cfg.key === "pace"
                    ? (v) => paceAxisTick(Number(v), displayUnit)
                    : undefined
                }
                label={{
                  value: axisLabel(cfg),
                  angle: 90,
                  position: "insideRight",
                  offset: i > 0 ? i * 12 : 0,
                  className: "fill-zinc-500 text-xs",
                }}
              />
            ))}
            {!leftMetric && !rightMetrics.some((m) => m.yAxisId === ghostAxisId) && (
              <YAxis yAxisId={ghostAxisId} hide />
            )}
            <Tooltip
              content={
                <ChartTooltip
                  displayUnit={displayUnit}
                  metrics={metrics}
                  visible={visible}
                  overlay={overlay}
                  points={points}
                  showTargets={showTargets}
                />
              }
            />
            {showGhost && ghostLineData.length > 0 && (
              <Line
                data={ghostLineData}
                yAxisId={ghostAxisId}
                type="stepAfter"
                dataKey="y"
                stroke="#71717a"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                strokeOpacity={0.55}
              />
            )}
            {activeMetrics.map((cfg) => (
              <Line
                key={cfg.key}
                yAxisId={cfg.yAxisId}
                type="monotone"
                dataKey={cfg.dataKey}
                stroke={cfg.color}
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

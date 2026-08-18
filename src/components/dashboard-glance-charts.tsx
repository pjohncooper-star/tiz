"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Input, Select, SegmentedControl } from "@/components/ui";
import { useRechartsTooltipStyles } from "@/components/use-recharts-tooltip-styles";
import { formatPace } from "@/lib/units/pace";
import { formatDurationWindow } from "@/lib/activity/mean-max";
import { formatStreamDistance } from "@/lib/activity/record-streams";
import { formatDurationSeconds } from "@/lib/workout/workout-tree";
import {
  DASHBOARD_RANGE_LABELS,
  DASHBOARD_RANGE_PRESETS,
  defaultDashboardPreset,
  resolveDashboardRange,
  type CycleRangeBounds,
  type DashboardRangePreset,
  type SeasonRangeBounds,
} from "@/lib/dashboard/date-range";

type LongestActivityResponse = {
  id: string;
  name: string;
  date: string;
  distanceMeters: number;
  durationSeconds: number;
  href?: string;
} | null;

type GlanceResponse = {
  from: string;
  to: string;
  power: { points: Array<{ durationSec: number; value: number }>; activityCount: number };
  runPace: { points: Array<{ durationSec: number; value: number }>; activityCount: number };
  weeklyVolume: Array<{
    weekStart: string;
    swimHours: number;
    bikeHours: number;
    runHours: number;
  }>;
  zoneMix: Array<{ zone: number; minutes: number }>;
  longestRun?: LongestActivityResponse;
  longestRide?: LongestActivityResponse;
  error?: string;
};

type DurationTab = "power" | "run_pace";

const METERS_PER_MILE = 1609.344;

type DashboardGlanceChartsProps = {
  season?: SeasonRangeBounds | null;
  cycle?: CycleRangeBounds | null;
  displayUnit?: "METRIC" | "IMPERIAL";
  runDisplayUnit?: "METRIC" | "IMPERIAL";
  bikeDisplayUnit?: "METRIC" | "IMPERIAL";
};

function LongestActivityCard({
  title,
  emptyLabel,
  activity,
  displayUnit,
}: {
  title: string;
  emptyLabel: string;
  activity: LongestActivityResponse | undefined;
  displayUnit: "METRIC" | "IMPERIAL";
}) {
  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      {!activity ? (
        <p className="text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="space-y-1">
          <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatStreamDistance(activity.distanceMeters, displayUnit)}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {formatDurationSeconds(activity.durationSeconds)} · {activity.date}
          </p>
          <Link
            href={activity.href ?? `/activities/${activity.id}`}
            prefetch={activity.href?.startsWith("/workouts/") ? undefined : false}
            className="inline-block text-sm text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
          >
            {activity.name}
          </Link>
        </div>
      )}
    </section>
  );
}

export function DashboardGlanceCharts({
  season = null,
  cycle = null,
  displayUnit = "METRIC",
  runDisplayUnit,
  bikeDisplayUnit,
}: DashboardGlanceChartsProps) {
  const runUnit = runDisplayUnit ?? displayUnit;
  const bikeUnit = bikeDisplayUnit ?? displayUnit;
  const [preset, setPreset] = useState<DashboardRangePreset>(defaultDashboardPreset());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [durationTab, setDurationTab] = useState<DurationTab>("power");
  const [data, setData] = useState<GlanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failedRangeKey, setFailedRangeKey] = useState<string | null>(null);
  const tooltipStyles = useRechartsTooltipStyles();

  const range = useMemo(
    () =>
      resolveDashboardRange({
        preset,
        customFrom: customFrom || null,
        customTo: customTo || null,
        season,
        cycle,
      }),
    [preset, customFrom, customTo, season, cycle]
  );
  const rangeKey = `${range.from}:${range.to}`;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ from: range.from, to: range.to });
    fetch(`/api/dashboard/glance?${params}`)
      .then(async (res) => {
        const body = (await res.json()) as GlanceResponse;
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
        setFailedRangeKey(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load charts");
        setData(null);
        setFailedRangeKey(rangeKey);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, rangeKey]);

  const dataMatches =
    data != null && data.from === range.from && data.to === range.to;
  const showLoading = !dataMatches && failedRangeKey !== rangeKey;

  const powerRows = useMemo(
    () =>
      (data?.power.points ?? []).map((p) => ({
        durationSec: p.durationSec,
        label: formatDurationWindow(p.durationSec),
        watts: Math.round(p.value),
      })),
    [data]
  );

  const paceRows = useMemo(() => {
    return (data?.runPace.points ?? []).map((p) => {
      const secPerKm = p.value;
      const displaySec =
        displayUnit === "METRIC" ? secPerKm : secPerKm * (METERS_PER_MILE / 1000);
      return {
        durationSec: p.durationSec,
        label: formatDurationWindow(p.durationSec),
        paceSec: displaySec,
        paceLabel: formatPace(secPerKm, displayUnit === "METRIC" ? "km" : "mi"),
      };
    });
  }, [data, displayUnit]);

  const volumeRows = useMemo(
    () =>
      (data?.weeklyVolume ?? []).map((w) => ({
        ...w,
        label: w.weekStart.slice(5),
      })),
    [data]
  );

  const zoneRows = useMemo(
    () =>
      (data?.zoneMix ?? []).map((z) => ({
        zone: `Z${z.zone}`,
        hours: Math.round((z.minutes / 60) * 100) / 100,
        minutes: Math.round(z.minutes),
      })),
    [data]
  );

  const availablePresets = DASHBOARD_RANGE_PRESETS.filter((p) => {
    if (p === "this_season" && !season) return false;
    if (p === "this_cycle" && !cycle) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem]">
          <label className="mb-1 block text-xs text-zinc-500">Range</label>
          <Select
            value={preset}
            onChange={(e) => setPreset(e.target.value as DashboardRangePreset)}
          >
            {availablePresets.map((p) => (
              <option key={p} value={p}>
                {DASHBOARD_RANGE_LABELS[p]}
              </option>
            ))}
          </Select>
        </div>
        {preset === "custom" ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">From</label>
              <Input
                type="date"
                value={customFrom || range.from}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">To</label>
              <Input
                type="date"
                value={customTo || range.to}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </>
        ) : null}
        <p className="pb-2 text-xs text-zinc-500">
          {range.from} → {range.to}
          {cycle?.name && preset === "this_cycle" ? ` · ${cycle.name}` : ""}
        </p>
      </div>

      {showLoading ? (
        <p className="text-sm text-zinc-500">Loading charts…</p>
      ) : error ? (
        <p className="text-sm text-zinc-500">{error}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <LongestActivityCard
            title="Longest run"
            emptyLabel="No runs with distance in this range."
            activity={data?.longestRun}
            displayUnit={runUnit}
          />
          <LongestActivityCard
            title="Longest ride"
            emptyLabel="No rides with distance in this range."
            activity={data?.longestRide}
            displayUnit={bikeUnit}
          />

          <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Duration curves
              </h3>
              <SegmentedControl
                value={durationTab}
                onChange={setDurationTab}
                options={[
                  { value: "power", label: "Power" },
                  { value: "run_pace", label: "Run pace" },
                ]}
              />
            </div>
            {durationTab === "power" ? (
              powerRows.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No bike power streams in this range
                  {data ? ` (${data.power.activityCount} activities with power)` : ""}.
                </p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={powerRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={40} unit=" W" />
                      <Tooltip
                        contentStyle={tooltipStyles.contentStyle}
                        itemStyle={tooltipStyles.itemStyle}
                        labelStyle={tooltipStyles.labelStyle}
                        formatter={(value) => [`${value} W`, "Mean max"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="watts"
                        name="Power"
                        stroke="#ca8a04"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            ) : paceRows.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No run pace streams in this range
                {data ? ` (${data.runPace.activityCount} activities with pace)` : ""}.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={paceRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      width={48}
                      reversed
                      tickFormatter={(v: number) =>
                        formatPace(
                          displayUnit === "METRIC" ? v : v / (METERS_PER_MILE / 1000),
                          displayUnit === "METRIC" ? "km" : "mi"
                        )
                      }
                    />
                    <Tooltip
                      contentStyle={tooltipStyles.contentStyle}
                      itemStyle={tooltipStyles.itemStyle}
                      labelStyle={tooltipStyles.labelStyle}
                      formatter={(_value, _name, item) => {
                        const label =
                          item && typeof item === "object" && "payload" in item
                            ? (item.payload as { paceLabel?: string }).paceLabel
                            : undefined;
                        return [label ?? String(_value), "Best avg pace"];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="paceSec"
                      name="Pace"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              {durationTab === "power"
                ? "Mean-maximal power from bike activities with watt streams."
                : `Best average run pace (${displayUnit === "METRIC" ? "min/km" : "min/mi"}) by duration.`}
            </p>
          </section>

          <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Weekly volume & zone mix
            </h3>
            {volumeRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No swim/bike/run volume in this range.</p>
            ) : (
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={36} unit="h" />
                    <Tooltip
                      contentStyle={tooltipStyles.contentStyle}
                      itemStyle={tooltipStyles.itemStyle}
                      labelStyle={tooltipStyles.labelStyle}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="swimHours" name="Swim" stackId="v" fill="#0284c7" isAnimationActive={false} />
                    <Bar dataKey="bikeHours" name="Bike" stackId="v" fill="#ca8a04" isAnimationActive={false} />
                    <Bar dataKey="runHours" name="Run" stackId="v" fill="#16a34a" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {zoneRows.some((z) => z.minutes > 0) ? (
              <div className="mt-3 h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={zoneRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                    <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={36} unit="h" />
                    <Tooltip
                      contentStyle={tooltipStyles.contentStyle}
                      itemStyle={tooltipStyles.itemStyle}
                      labelStyle={tooltipStyles.labelStyle}
                      formatter={(value, _name, item) => {
                        const minutes =
                          item && typeof item === "object" && "payload" in item
                            ? (item.payload as { minutes?: number }).minutes
                            : undefined;
                        return [
                          `${value}h${minutes != null ? ` (${minutes} min)` : ""}`,
                          "Time in zone",
                        ];
                      }}
                    />
                    <Bar dataKey="hours" name="Hours" fill="#64748b" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">No canonical zone minutes in this range.</p>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              Volume prefers TiZ minutes when present, otherwise activity duration. Zone mix is
              canonical Z1–Z5 across swim, bike, and run.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

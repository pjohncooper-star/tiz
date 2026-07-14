"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SegmentedControl } from "@/components/ui";
import {
  computeFitnessFatigueWeekly,
  mondayWeekStartKey,
  type EcoImpulse,
  type FitnessFatiguePoint,
} from "@/lib/eco/fitness-fatigue";
import {
  mergeHistoryAndPlanImpulses,
  seasonWeekEcoImpulses,
  type SeasonWeekForEco,
} from "@/lib/eco/hybrid-impulses";
import type { ZoneMinutes } from "@/lib/workout/steps";

type Mode = "form" | "gh";

type SerializedImpulse = {
  startTime: string;
  utcOffsetSeconds: number | null;
  discipline: string;
  ecos: number;
};

type ApiResponse = {
  enabled: boolean;
  includePlan?: boolean;
  seasonId?: string | null;
  today?: string;
  from: string | null;
  to: string | null;
  tau1: number;
  tau2: number;
  note: string;
  series: FitnessFatiguePoint[];
  history?: SerializedImpulse[];
  error?: string;
};

type ChartRow = {
  date: string;
  swimFormH: number | null;
  bikeFormH: number | null;
  runFormH: number | null;
  combinedH: number | null;
  swimGH: number | null;
  swimHH: number | null;
  bikeGH: number | null;
  bikeHH: number | null;
  runGH: number | null;
  runHH: number | null;
  swimFormF: number | null;
  bikeFormF: number | null;
  runFormF: number | null;
  combinedF: number | null;
  swimGF: number | null;
  swimHF: number | null;
  bikeGF: number | null;
  bikeHF: number | null;
  runGF: number | null;
  runHF: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toHybridRows(
  series: FitnessFatiguePoint[],
  splitKey: string
): ChartRow[] {
  return series.map((p) => {
    const isPast = p.date < splitKey;
    const isSplit = p.date === splitKey;
    const isFuture = p.date > splitKey;
    const showHistory = isPast || isSplit;
    const showForecast = isSplit || isFuture;

    const swimForm = round1(p.swim.form);
    const bikeForm = round1(p.bike.form);
    const runForm = round1(p.run.form);
    const combined = round1(p.form);
    const swimG = round1(p.swim.g);
    const swimH = round1(p.swim.h);
    const bikeG = round1(p.bike.g);
    const bikeH = round1(p.bike.h);
    const runG = round1(p.run.g);
    const runH = round1(p.run.h);

    return {
      date: p.date,
      swimFormH: showHistory ? swimForm : null,
      bikeFormH: showHistory ? bikeForm : null,
      runFormH: showHistory ? runForm : null,
      combinedH: showHistory ? combined : null,
      swimGH: showHistory ? swimG : null,
      swimHH: showHistory ? swimH : null,
      bikeGH: showHistory ? bikeG : null,
      bikeHH: showHistory ? bikeH : null,
      runGH: showHistory ? runG : null,
      runHH: showHistory ? runH : null,
      swimFormF: showForecast ? swimForm : null,
      bikeFormF: showForecast ? bikeForm : null,
      runFormF: showForecast ? runForm : null,
      combinedF: showForecast ? combined : null,
      swimGF: showForecast ? swimG : null,
      swimHF: showForecast ? swimH : null,
      bikeGF: showForecast ? bikeG : null,
      bikeHF: showForecast ? bikeH : null,
      runGF: showForecast ? runG : null,
      runHF: showForecast ? runH : null,
    };
  });
}

function localTodayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFromKey(todayKey: string): string {
  const d = new Date(`${todayKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString().slice(0, 10);
}

function defaultToKey(todayKey: string, weeks?: SeasonWeekForEco[]): string {
  if (weeks && weeks.length > 0) {
    const last = [...weeks]
      .map((w) => w.weekStartDate)
      .filter(Boolean)
      .sort()
      .at(-1);
    if (last) {
      const d = new Date(`${last}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 6);
      return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(`${todayKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 90);
  return d.toISOString().slice(0, 10);
}

function historyToImpulses(rows: SerializedImpulse[] | undefined): EcoImpulse[] {
  if (!rows) return [];
  return rows.map((row) => ({
    startTime: new Date(row.startTime),
    utcOffsetSeconds: row.utcOffsetSeconds,
    discipline: row.discipline,
    ecos: row.ecos,
  }));
}

type FitnessFatigueChartProps = {
  /** When true, include calendar PlannedSession TiZ projections. */
  includePlan?: boolean;
  /** Saved season id — server loads week TiZ for forecast. */
  seasonId?: string | null;
  /**
   * Live draft weeks from the simple planner. When set, client merges these
   * as season TiZ→ECO impulses (overrides server seasonId projection).
   */
  draftWeeks?: Array<{
    weekStartDate: string;
    zoneMinutes: ZoneMinutes;
    isRestWeek?: boolean;
  }>;
  from?: string;
  to?: string;
  className?: string;
  compact?: boolean;
};

export function FitnessFatigueChart({
  includePlan = false,
  seasonId = null,
  draftWeeks,
  from: fromProp,
  to: toProp,
  className = "",
  compact = false,
}: FitnessFatigueChartProps) {
  const [mode, setMode] = useState<Mode>("form");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const todayKey = useMemo(() => localTodayKey(), []);
  const useDraftWeeks = Boolean(draftWeeks && draftWeeks.length > 0);
  const showForecast = includePlan || useDraftWeeks || Boolean(seasonId);

  useEffect(() => {
    let cancelled = false;
    const from = fromProp ?? defaultFromKey(todayKey);
    const to =
      toProp ??
      (showForecast ? defaultToKey(todayKey, draftWeeks) : todayKey);
    const params = new URLSearchParams({ from, to, today: todayKey });
    if (includePlan) params.set("includePlan", "1");
    // When live draft weeks are provided, skip server season to avoid double count.
    if (seasonId && !useDraftWeeks) params.set("seasonId", seasonId);

    setLoading(true);
    fetch(`/api/eco/fitness-fatigue?${params}`)
      .then(async (res) => {
        const body = (await res.json()) as ApiResponse;
        if (!res.ok) {
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    includePlan,
    seasonId,
    useDraftWeeks,
    fromProp,
    toProp,
    todayKey,
    // Remount-friendly: stringify week zone totals lightly
    draftWeeks
      ?.map(
        (w) =>
          `${w.weekStartDate}:${w.isRestWeek ? 1 : 0}:${Object.entries(w.zoneMinutes)
            .map(([k, v]) => `${k}=${v}`)
            .join(",")}`
      )
      .join("|") ?? "",
  ]);

  const series = useMemo(() => {
    if (!data) return [];
    const today = data.today ?? todayKey;
    const from = fromProp ?? data.from ?? defaultFromKey(today);
    const to =
      toProp ??
      data.to ??
      (showForecast ? defaultToKey(today, draftWeeks) : today);

    if (useDraftWeeks && draftWeeks) {
      const history = historyToImpulses(data.history);
      const seasonPlanned = seasonWeekEcoImpulses({ weeks: draftWeeks, todayKey: today });
      return computeFitnessFatigueWeekly(
        mergeHistoryAndPlanImpulses(history, seasonPlanned),
        { from: from ?? undefined, to }
      );
    }

    return data.series ?? [];
  }, [data, draftWeeks, useDraftWeeks, fromProp, toProp, todayKey, showForecast]);

  const rows = useMemo(() => {
    if (!series.length) return [];
    const today = data?.today ?? todayKey;
    // Weekly planner: split at the Monday of the current week; daily charts split at today.
    const splitKey = useDraftWeeks ? mondayWeekStartKey(today) : today;
    return toHybridRows(series, splitKey);
  }, [series, data?.today, todayKey, useDraftWeeks]);

  const heightClass = compact ? "h-56" : "h-72";

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "form", label: "Form" },
            { value: "gh", label: "Fitness / fatigue" },
          ]}
        />
        {data ? (
          <p className="text-xs text-zinc-500">
            τ₁={data.tau1}d · τ₂={data.tau2}d
            {useDraftWeeks
              ? " · weekly PMC"
              : showForecast
                ? " · plan projected"
                : ""}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading fitness / fatigue…</p>
      ) : error ? (
        <p className="text-sm text-zinc-500">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {showForecast
            ? "No scored ECO history or projectable planned TiZ yet."
            : "No scored ECO sessions yet. Import or sync activities with zones."}
        </p>
      ) : (
        <div className={`${heightClass} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                minTickGap={32}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(label) => String(label)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {mode === "form" ? (
                <>
                  <Line type="monotone" dataKey="swimFormH" name="Swim" stroke="#0284c7" dot={false} strokeWidth={1.75} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="swimFormF" name="Swim (plan)" stroke="#0284c7" dot={false} strokeWidth={1.75} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} legendType={showForecast ? "line" : "none"} hide={!showForecast} />
                  <Line type="monotone" dataKey="bikeFormH" name="Bike" stroke="#ca8a04" dot={false} strokeWidth={1.75} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bikeFormF" name="Bike (plan)" stroke="#ca8a04" dot={false} strokeWidth={1.75} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} legendType={showForecast ? "line" : "none"} hide={!showForecast} />
                  <Line type="monotone" dataKey="runFormH" name="Run" stroke="#16a34a" dot={false} strokeWidth={1.75} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="runFormF" name="Run (plan)" stroke="#16a34a" dot={false} strokeWidth={1.75} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} legendType={showForecast ? "line" : "none"} hide={!showForecast} />
                  <Line type="monotone" dataKey="combinedH" name="Combined" stroke="#18181b" dot={false} strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="combinedF" name="Combined (plan)" stroke="#18181b" dot={false} strokeWidth={2} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} legendType={showForecast ? "line" : "none"} hide={!showForecast} />
                </>
              ) : (
                <>
                  <Line type="monotone" dataKey="swimGH" name="Swim fitness" stroke="#0284c7" dot={false} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="swimGF" name="Swim fitness (plan)" stroke="#0284c7" dot={false} strokeWidth={1.5} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} hide={!showForecast} legendType={showForecast ? "line" : "none"} />
                  <Line type="monotone" dataKey="swimHH" name="Swim fatigue" stroke="#7dd3fc" dot={false} strokeWidth={1.25} strokeDasharray="3 2" connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="swimHF" name="Swim fatigue (plan)" stroke="#7dd3fc" dot={false} strokeWidth={1.25} strokeDasharray="2 3" connectNulls={false} isAnimationActive={false} hide={!showForecast} legendType={showForecast ? "line" : "none"} />
                  <Line type="monotone" dataKey="bikeGH" name="Bike fitness" stroke="#ca8a04" dot={false} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bikeGF" name="Bike fitness (plan)" stroke="#ca8a04" dot={false} strokeWidth={1.5} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} hide={!showForecast} legendType={showForecast ? "line" : "none"} />
                  <Line type="monotone" dataKey="bikeHH" name="Bike fatigue" stroke="#fde047" dot={false} strokeWidth={1.25} strokeDasharray="3 2" connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bikeHF" name="Bike fatigue (plan)" stroke="#fde047" dot={false} strokeWidth={1.25} strokeDasharray="2 3" connectNulls={false} isAnimationActive={false} hide={!showForecast} legendType={showForecast ? "line" : "none"} />
                  <Line type="monotone" dataKey="runGH" name="Run fitness" stroke="#16a34a" dot={false} strokeWidth={1.5} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="runGF" name="Run fitness (plan)" stroke="#16a34a" dot={false} strokeWidth={1.5} strokeDasharray="5 4" connectNulls={false} isAnimationActive={false} hide={!showForecast} legendType={showForecast ? "line" : "none"} />
                  <Line type="monotone" dataKey="runHH" name="Run fatigue" stroke="#86efac" dot={false} strokeWidth={1.25} strokeDasharray="3 2" connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="runHF" name="Run fatigue (plan)" stroke="#86efac" dot={false} strokeWidth={1.25} strokeDasharray="2 3" connectNulls={false} isAnimationActive={false} hide={!showForecast} legendType={showForecast ? "line" : "none"} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        {useDraftWeeks
          ? "Weekly PMC · solid = scored history; dashed = this season’s weekly TiZ projected to ECO."
          : data?.note ??
            (showForecast
              ? "Solid = scored history; dashed = planned TiZ projected to ECO."
              : "Fitness (τ≈42) and fatigue (τ≈7) use population defaults, not athlete-fit values.")}
      </p>
    </div>
  );
}

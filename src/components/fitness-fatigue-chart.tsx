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
import type { FitnessFatiguePoint } from "@/lib/eco/fitness-fatigue";

type Mode = "form" | "gh";

type ApiResponse = {
  enabled: boolean;
  from: string | null;
  to: string | null;
  tau1: number;
  tau2: number;
  note: string;
  series: FitnessFatiguePoint[];
  error?: string;
};

type ChartRow = {
  date: string;
  swimForm: number;
  bikeForm: number;
  runForm: number;
  combined: number;
  swimG: number;
  swimH: number;
  bikeG: number;
  bikeH: number;
  runG: number;
  runH: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toChartRows(series: FitnessFatiguePoint[]): ChartRow[] {
  return series.map((p) => ({
    date: p.date,
    swimForm: round1(p.swim.form),
    bikeForm: round1(p.bike.form),
    runForm: round1(p.run.form),
    combined: round1(p.form),
    swimG: round1(p.swim.g),
    swimH: round1(p.swim.h),
    bikeG: round1(p.bike.g),
    bikeH: round1(p.bike.h),
    runG: round1(p.run.g),
    runH: round1(p.run.h),
  }));
}

/** Default lookback for the dashboard PMC (~6 months). */
function defaultFromKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 180);
  return d.toISOString().slice(0, 10);
}

export function FitnessFatigueChart() {
  const [mode, setMode] = useState<Mode>("form");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const from = defaultFromKey();
    setLoading(true);
    fetch(`/api/eco/fitness-fatigue?from=${from}`)
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
  }, []);

  const rows = useMemo(
    () => (data?.series ? toChartRows(data.series) : []),
    [data]
  );

  return (
    <div className="space-y-3">
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
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading fitness / fatigue…</p>
      ) : error ? (
        <p className="text-sm text-zinc-500">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No scored ECO sessions yet. Import or sync activities with zones.
        </p>
      ) : (
        <div className="h-72 w-full">
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
                  <Line
                    type="monotone"
                    dataKey="swimForm"
                    name="Swim form"
                    stroke="#0284c7"
                    dot={false}
                    strokeWidth={1.75}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bikeForm"
                    name="Bike form"
                    stroke="#ca8a04"
                    dot={false}
                    strokeWidth={1.75}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="runForm"
                    name="Run form"
                    stroke="#16a34a"
                    dot={false}
                    strokeWidth={1.75}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="combined"
                    name="Combined"
                    stroke="#18181b"
                    dot={false}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    isAnimationActive={false}
                  />
                </>
              ) : (
                <>
                  <Line type="monotone" dataKey="swimG" name="Swim fitness" stroke="#0284c7" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line type="monotone" dataKey="swimH" name="Swim fatigue" stroke="#7dd3fc" dot={false} strokeWidth={1.25} strokeDasharray="3 2" isAnimationActive={false} />
                  <Line type="monotone" dataKey="bikeG" name="Bike fitness" stroke="#ca8a04" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bikeH" name="Bike fatigue" stroke="#fde047" dot={false} strokeWidth={1.25} strokeDasharray="3 2" isAnimationActive={false} />
                  <Line type="monotone" dataKey="runG" name="Run fitness" stroke="#16a34a" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  <Line type="monotone" dataKey="runH" name="Run fatigue" stroke="#86efac" dot={false} strokeWidth={1.25} strokeDasharray="3 2" isAnimationActive={false} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        {data?.note ??
          "Fitness (τ≈42) and fatigue (τ≈7) use population defaults, not athlete-fit values. Days use activity-local time when the source provided an offset."}
      </p>
    </div>
  );
}

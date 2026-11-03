"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRechartsTooltipStyles } from "@/components/use-recharts-tooltip-styles";
import { progressHref } from "@/lib/progress/href";
import type { SeasonProgress } from "@/lib/progress/season-progress";

type ChartRow = {
  label: string;
  weekStart: string;
  completed: number;
  scheduledRemaining: number;
  target: number | null;
  phaseName: string | null;
  isRestWeek: boolean;
};

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

function isRowPayload(value: unknown): value is { weekStart: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { weekStart?: unknown }).weekStart === "string"
  );
}

export function SeasonVolumeChart({ progress }: { progress: SeasonProgress }) {
  const router = useRouter();
  const tooltipStyles = useRechartsTooltipStyles();

  const rows: ChartRow[] = useMemo(
    () =>
      progress.weeks.map((week) => ({
        label: `W${(week.weekIndex ?? 0) + 1}`,
        weekStart: week.weekStart,
        completed: hours(week.totals.completedMinutes),
        scheduledRemaining:
          week.state === "past"
            ? 0
            : hours(Math.max(0, week.totals.plannedMinutes - week.totals.completedMinutes)),
        target: week.totals.targetMinutes != null ? hours(week.totals.targetMinutes) : null,
        phaseName: week.phase?.name ?? null,
        isRestWeek: week.isRestWeek,
      })),
    [progress.weeks]
  );

  const bands = useMemo(
    () =>
      progress.phases
        .map((phase) => {
          const first = progress.weeks.find((w) => w.phaseId === phase.id);
          const last = [...progress.weeks].reverse().find((w) => w.phaseId === phase.id);
          if (!first || !last) return null;
          return {
            id: phase.id,
            color: phase.color,
            x1: `W${(first.weekIndex ?? 0) + 1}`,
            x2: `W${(last.weekIndex ?? 0) + 1}`,
          };
        })
        .filter((band): band is NonNullable<typeof band> => band !== null),
    [progress.phases, progress.weeks]
  );

  const currentWeek = progress.weeks.find((w) => w.state === "current");

  const openWeek = (payload: unknown) => {
    const row = isRowPayload(payload)
      ? payload
      : typeof payload === "object" && payload !== null && "payload" in payload
        ? (payload as { payload: unknown }).payload
        : null;
    if (isRowPayload(row)) {
      router.push(progressHref({ view: "week", weekStart: row.weekStart }));
    }
  };

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#a1a1aa33" />
            {bands.map((band) => (
              <ReferenceArea
                key={band.id}
                x1={band.x1}
                x2={band.x2}
                fill={band.color}
                fillOpacity={0.1}
                ifOverflow="extendDomain"
              />
            ))}
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} unit="h" />
            <Tooltip
              {...tooltipStyles}
              formatter={(value, name) => [`${value}h`, String(name)]}
              labelFormatter={(label, payload) => {
                const row = payload?.[0]?.payload as ChartRow | undefined;
                if (!row) return String(label);
                const extras = [row.phaseName, row.isRestWeek ? "de-load" : null]
                  .filter(Boolean)
                  .join(" · ");
                return `${label} · ${row.weekStart}${extras ? ` · ${extras}` : ""}`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="completed"
              name="Completed"
              stackId="hours"
              fill="#0ea5e9"
              cursor="pointer"
              onClick={openWeek}
            />
            <Bar
              dataKey="scheduledRemaining"
              name="Scheduled, not yet done"
              stackId="hours"
              fill="#d4d4d8"
              cursor="pointer"
              onClick={openWeek}
            />
            <Line
              dataKey="target"
              name="Season target"
              type="stepAfter"
              stroke="#18181b"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              connectNulls
            />
            {currentWeek ? (
              <ReferenceLine
                x={`W${(currentWeek.weekIndex ?? 0) + 1}`}
                stroke="#0ea5e9"
                strokeDasharray="2 2"
                label={{ value: "Now", position: "top", fontSize: 11, fill: "#0ea5e9" }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Hours per week for swim, bike and run. Shaded bands are phases. Click a bar to open that week.
      </p>
    </div>
  );
}

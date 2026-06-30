"use client";

import type { Discipline } from "@prisma/client";
import { zoneKey } from "@/lib/workout/steps";
import { formatZoneMinutes } from "@/lib/workout/steps";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";

const ZONES = [1, 2, 3, 4, 5] as const;

const ZONE_COLORS: Record<number, string> = {
  1: "bg-sky-200 dark:bg-sky-900",
  2: "bg-sky-400 dark:bg-sky-700",
  3: "bg-amber-400 dark:bg-amber-700",
  4: "bg-orange-500 dark:bg-orange-700",
  5: "bg-red-500 dark:bg-red-700",
};

type PlanTizChartProps = {
  discipline: Discipline;
  values: Record<string, number>;
  maxMinutes?: number;
};

export function PlanTizChart({ discipline, values, maxMinutes }: PlanTizChartProps) {
  const zoneMinutes = ZONES.map((z) => values[zoneKey(discipline, z)] ?? 0);
  const total = zoneMinutes.reduce((s, m) => s + m, 0);
  const max = maxMinutes ?? Math.max(total, 1);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{DISCIPLINE_DISPLAY_LABELS[discipline]}</span>
        <span className="text-zinc-500">{formatZoneMinutes(total)}</span>
      </div>
      <div className="flex h-5 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
        {ZONES.map((zone, i) => {
          const minutes = zoneMinutes[i];
          if (minutes <= 0) return null;
          const width = (minutes / max) * 100;
          const pct = total > 0 ? Math.round((minutes / total) * 1000) / 10 : 0;
          return (
            <div
              key={zone}
              className={`${ZONE_COLORS[zone]} h-full`}
              style={{ width: `${width}%` }}
              title={`Z${zone}: ${formatZoneMinutes(minutes)} · ${pct}%`}
            />
          );
        })}
      </div>
      <div className="flex gap-2 text-[10px] text-zinc-500">
        {ZONES.map((zone, i) =>
          zoneMinutes[i] > 0 ? (
            <span key={zone}>
              Z{zone} {formatZoneMinutes(zoneMinutes[i])}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

export function disciplineZoneTotal(
  discipline: Discipline,
  ...maps: Array<Record<string, number>>
): number {
  let total = 0;
  for (const z of ZONES) {
    for (const map of maps) {
      total += map[zoneKey(discipline, z)] ?? 0;
    }
  }
  return total;
}

/** Max zone total for one discipline across maps (sums maps per zone). */
export function maxChartMinutesForDiscipline(
  discipline: Discipline,
  ...maps: Array<Record<string, number>>
): number {
  return Math.max(disciplineZoneTotal(discipline, ...maps), 1);
}

export function maxChartMinutes(
  ...maps: Array<Record<string, number>>
): number {
  const disciplines: Discipline[] = ["BIKE", "RUN", "SWIM"];
  let max = 0;
  for (const d of disciplines) {
    max = Math.max(max, disciplineZoneTotal(d, ...maps));
  }
  return max || 60;
}

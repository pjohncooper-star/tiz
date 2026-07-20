"use client";

import type { Discipline } from "@prisma/client";
import { useRef, useState } from "react";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import {
  buildCollapsedWeekSummaryPills,
  combinedZoneTotals,
  formatSummaryDistance,
  formatSummaryDuration,
  formatTotalDistanceSummary,
  maxZoneBarMinutes,
  remainingZoneArray,
  sportZoneTotals,
  summarizeWeekCompletedActivities,
  summarizeWeekCompletedSessions,
  mergeWeekSummaries,
  linkedActivityIdsExcludedFromCompletedRollup,
  summarizeWeekPlannedSessions,
  weekSummaryHasData,
  type CollapsedSummaryPill,
  type WeekPlannedSummary,
  type WeekSportSummary,
} from "@/lib/plan/calendar/week-summary";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";
import { formatZoneMinutes } from "@/lib/workout/steps";
import { formatDisplayNumber } from "@/lib/format-display-number";

const ZONES = [1, 2, 3, 4, 5] as const;

const ZONE_COLORS: Record<number, string> = {
  1: "bg-sky-200 dark:bg-sky-900",
  2: "bg-sky-400 dark:bg-sky-700",
  3: "bg-amber-400 dark:bg-amber-700",
  4: "bg-orange-500 dark:bg-orange-700",
  5: "bg-red-500 dark:bg-red-700",
};

const COLLAPSED_PILL_STYLES: Record<string, string> = {
  total: "bg-violet-100 text-violet-900 dark:bg-violet-950/80 dark:text-violet-200",
  BIKE: "bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200",
  RUN: "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200",
  SWIM: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200",
  STRENGTH: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function CollapsedSummaryPills({ pills }: { pills: CollapsedSummaryPill[] }) {
  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((pill, index) => (
        <span key={pill.id} className="inline-flex items-center gap-1.5">
          {index > 0 ? (
            <span className="text-xs text-zinc-300 dark:text-zinc-600" aria-hidden>
              |
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-tight tabular-nums ${COLLAPSED_PILL_STYLES[pill.id] ?? COLLAPSED_PILL_STYLES.STRENGTH}`}
          >
            <span className="font-semibold">{pill.label}</span>
            <span>{pill.text}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function CollapsedMetricsSection({
  label,
  pills,
}: {
  label: string;
  pills: CollapsedSummaryPill[];
}) {
  if (pills.length === 0) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white/90 p-2 dark:border-zinc-700 dark:bg-zinc-950/60">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <CollapsedSummaryPills pills={pills} />
    </div>
  );
}

type TizTooltipState = {
  title: string;
  zone: number;
  minutes: number;
  x: number;
  y: number;
};

function zoneAtPointer(
  zoneMinutes: number[],
  maxMinutes: number,
  offsetX: number,
  barWidth: number
): { zone: number; minutes: number } | null {
  if (barWidth <= 0) return null;
  let edge = 0;
  for (let i = 0; i < ZONES.length; i++) {
    const minutes = zoneMinutes[i];
    if (minutes <= 0) continue;
    const segmentWidth = (minutes / maxMinutes) * barWidth;
    if (offsetX >= edge && offsetX < edge + segmentWidth) {
      return { zone: ZONES[i], minutes };
    }
    edge += segmentWidth;
  }
  return null;
}

const TIZ_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-wide text-zinc-400 sm:text-right";
const TIZ_STACK_CLASS = "w-full max-w-[15.5rem] sm:ml-auto";
const TIZ_ROW_CLASS =
  "grid w-full grid-cols-1 gap-1 sm:grid-cols-[4.5rem_minmax(6.5rem,10.5rem)] sm:items-center sm:justify-items-end";
const TIZ_BAR_CLASS =
  "flex h-4 w-full min-w-0 cursor-crosshair overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800";

function TizBarWithTooltip({
  zoneMinutes,
  maxMinutes,
  title,
}: {
  zoneMinutes: number[];
  maxMinutes: number;
  title: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TizTooltipState | null>(null);
  const total = zoneMinutes.reduce((s, m) => s + m, 0);

  if (total <= 0) {
    return <span className="block w-full text-right text-xs text-zinc-400 sm:text-left">—</span>;
  }

  function updateTooltip(clientX: number, clientY: number) {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const hit = zoneAtPointer(zoneMinutes, maxMinutes, clientX - rect.left, rect.width);
    if (!hit) {
      setTooltip(null);
      return;
    }
    setTooltip({
      title,
      zone: hit.zone,
      minutes: hit.minutes,
      x: clientX,
      y: clientY,
    });
  }

  return (
    <>
      <div
        ref={barRef}
        className={TIZ_BAR_CLASS}
        role="img"
        aria-label={`${title}: ${formatZoneMinutes(total)} zone time`}
        onMouseMove={(e) => updateTooltip(e.clientX, e.clientY)}
        onMouseLeave={() => setTooltip(null)}
      >
        {ZONES.map((zone, i) => {
          const minutes = zoneMinutes[i];
          if (minutes <= 0) return null;
          return (
            <div
              key={zone}
              className={`${ZONE_COLORS[zone]} h-full`}
              style={{ width: `${(minutes / maxMinutes) * 100}%` }}
            />
          );
        })}
      </div>
      {tooltip ? (
        <div
          className="pointer-events-none fixed z-50 -translate-y-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: tooltip.x + 10, top: tooltip.y - 8 }}
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{tooltip.title}</p>
          <p className="mt-0.5 tabular-nums text-zinc-600 dark:text-zinc-300">
            Zone {tooltip.zone}: {formatZoneMinutes(tooltip.minutes)}
          </p>
          <p className="tabular-nums text-[10px] text-zinc-500">
            {total > 0 ? `${Math.round((tooltip.minutes / total) * 1000) / 10}%` : "—"}
          </p>
        </div>
      ) : null}
    </>
  );
}

function TizBarRow({
  sideLabel,
  tizTitle,
  zoneMinutes,
  maxMinutes,
}: {
  sideLabel: string;
  tizTitle: string;
  zoneMinutes: number[];
  maxMinutes: number;
}) {
  return (
    <div className={TIZ_ROW_CLASS}>
      <p className={`${TIZ_LABEL_CLASS} sm:justify-self-end`}>{sideLabel}</p>
      <div className="w-full min-w-0 justify-self-end">
        <TizBarWithTooltip zoneMinutes={zoneMinutes} maxMinutes={maxMinutes} title={tizTitle} />
      </div>
    </div>
  );
}

const SPORT_COL_CLASS = "w-[5rem] shrink-0 lg:w-[5.5rem]";
const TIZ_COL_CLASS = "w-full max-w-[15.5rem] shrink-0 justify-self-end";
const METRICS_MIDDLE_CLASS = "flex min-w-0 flex-1 items-start justify-center gap-10 lg:gap-16";

/** Desktop row: sport | centered planned/completed | fixed TiZ. */
const METRICS_DESKTOP_ROW =
  "hidden sm:grid sm:w-full sm:grid-cols-[5rem_minmax(0,1fr)_15.5rem] sm:items-start lg:grid-cols-[5.5rem_minmax(0,1fr)_15.5rem]";

const METRIC_TRIPLET_GRID =
  "grid grid-cols-[2.25rem_4.5rem_minmax(0,5.5rem)] gap-x-4 lg:grid-cols-[2.25rem_5rem_minmax(0,6rem)]";

const METRIC_HEADER_TRIPLET =
  `${METRIC_TRIPLET_GRID} text-[10px] font-medium uppercase tracking-wide text-zinc-400`;

function MetricTripletSubheaders() {
  return (
    <>
      <span>No</span>
      <span>Duration</span>
      <span>Distance</span>
    </>
  );
}

function MetricsDesktopHeader({
  hasScheduled,
  hasCompleted,
}: {
  hasScheduled: boolean;
  hasCompleted: boolean;
}) {
  return (
    <div className={`${METRICS_DESKTOP_ROW} mb-2 border-b border-zinc-200 pb-2 dark:border-zinc-800`}>
      <span className={`${SPORT_COL_CLASS} text-[10px] font-medium uppercase tracking-wide text-zinc-400`}>
        Sport
      </span>
      <div className={METRICS_MIDDLE_CLASS}>
        {hasScheduled ? (
          <div className={METRIC_HEADER_TRIPLET}>
            <span className="col-span-3 text-zinc-600 dark:text-zinc-300">Scheduled</span>
            <MetricTripletSubheaders />
          </div>
        ) : null}
        {hasCompleted ? (
          <div className={METRIC_HEADER_TRIPLET}>
            <span className="col-span-3 text-zinc-600 dark:text-zinc-300">Completed</span>
            <MetricTripletSubheaders />
          </div>
        ) : null}
      </div>
      <span className={`${TIZ_COL_CLASS} text-right text-[10px] font-medium uppercase tracking-wide text-zinc-400`}>
        Time in zone
      </span>
    </div>
  );
}

function rowHasData(row: WeekSportSummary, zoneMinutes: number[], isTotal?: boolean) {
  if (isTotal) return true;
  return (
    row.sessionCount > 0 ||
    row.plannedMinutes > 0 ||
    row.distanceMeters > 0 ||
    zoneMinutes.some((z) => z > 0)
  );
}

function SummaryMetricCells({
  row,
  distanceLabel,
  side,
}: {
  row: WeekSportSummary | null;
  distanceLabel: string;
  side: "scheduled" | "completed";
}) {
  const sideLabel = side === "scheduled" ? "Scheduled" : "Completed";

  if (!row) {
    return (
      <>
        <div className={`${METRIC_TRIPLET_GRID} hidden sm:grid`}>
          <div className="text-xs tabular-nums text-zinc-400">—</div>
          <div className="text-xs tabular-nums text-zinc-400">—</div>
          <div className="text-xs text-zinc-400">—</div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 pt-2 sm:hidden dark:border-zinc-800">
          <p className="col-span-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {sideLabel}
          </p>
          <p className="text-xs text-zinc-400">—</p>
          <p className="text-xs text-zinc-400">—</p>
          <p className="text-xs text-zinc-400">—</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`${METRIC_TRIPLET_GRID} hidden sm:grid`}>
        <div className="text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          {row.sessionCount > 0 ? formatDisplayNumber(row.sessionCount, 0) : "—"}
        </div>
        <div className="text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          {formatSummaryDuration(row.plannedMinutes)}
        </div>
        <div className="min-w-0 text-xs text-zinc-700 dark:text-zinc-200">{distanceLabel}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-zinc-200 pt-2 sm:hidden dark:border-zinc-800">
        <p className="col-span-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {sideLabel}
        </p>
        <p className="text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          <span className="mr-1 text-[10px] text-zinc-500">No</span>
          {row.sessionCount > 0 ? formatDisplayNumber(row.sessionCount, 0) : "—"}
        </p>
        <p className="text-xs tabular-nums text-zinc-700 dark:text-zinc-200">
          <span className="mr-1 text-[10px] text-zinc-500">Duration</span>
          {formatSummaryDuration(row.plannedMinutes)}
        </p>
        <p className="min-w-0 text-xs text-zinc-700 dark:text-zinc-200">
          <span className="mr-1 text-[10px] text-zinc-500">Distance</span>
          {distanceLabel}
        </p>
      </div>
    </>
  );
}

function StackedTizColumn({
  sportLabel,
  scheduledZoneMinutes,
  completedZoneMinutes,
  maxZoneMinutes,
  showScheduled,
  showCompleted,
}: {
  sportLabel: string;
  scheduledZoneMinutes: number[];
  completedZoneMinutes: number[];
  maxZoneMinutes: number;
  showScheduled: boolean;
  showCompleted: boolean;
}) {
  return (
    <div className={`${TIZ_COL_CLASS} flex justify-end`}>
      <div className={`flex flex-col gap-2 ${TIZ_STACK_CLASS}`}>
        <span className="sr-only">Time in zone for {sportLabel}</span>
        {showScheduled ? (
          <TizBarRow
            sideLabel="Scheduled"
            tizTitle="Scheduled TiZ"
            zoneMinutes={scheduledZoneMinutes}
            maxMinutes={maxZoneMinutes}
          />
        ) : null}
        {showCompleted ? (
          <TizBarRow
            sideLabel="Completed"
            tizTitle="Completed TiZ"
            zoneMinutes={completedZoneMinutes}
            maxMinutes={maxZoneMinutes}
          />
        ) : null}
      </div>
    </div>
  );
}

function CombinedSummaryRow({
  sportLabel,
  scheduledRow,
  completedRow,
  scheduledDistanceLabel,
  completedDistanceLabel,
  scheduledZoneMinutes,
  completedZoneMinutes,
  maxZoneMinutes,
  showScheduled,
  showCompleted,
  isTotal,
}: {
  sportLabel: string;
  scheduledRow: WeekSportSummary | null;
  completedRow: WeekSportSummary | null;
  scheduledDistanceLabel: string;
  completedDistanceLabel: string;
  scheduledZoneMinutes: number[];
  completedZoneMinutes: number[];
  maxZoneMinutes: number;
  showScheduled: boolean;
  showCompleted: boolean;
  isTotal?: boolean;
}) {
  const showRow =
    isTotal ||
    (showScheduled && rowHasData(scheduledRow ?? emptySportRow(), scheduledZoneMinutes)) ||
    (showCompleted && rowHasData(completedRow ?? emptySportRow(), completedZoneMinutes));
  if (!showRow) return null;

  return (
    <>
      <div className="space-y-2 border-t border-zinc-200 py-2 first:border-t-0 first:pt-0 dark:border-zinc-800 sm:hidden">
        <p
          className={`text-xs font-medium ${isTotal ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"}`}
        >
          {sportLabel}
        </p>
        {showScheduled ? (
          <SummaryMetricCells
            row={scheduledRow}
            distanceLabel={scheduledDistanceLabel}
            side="scheduled"
          />
        ) : null}
        {showCompleted ? (
          <SummaryMetricCells
            row={completedRow}
            distanceLabel={completedDistanceLabel}
            side="completed"
          />
        ) : null}
        <StackedTizColumn
          sportLabel={sportLabel}
          scheduledZoneMinutes={scheduledZoneMinutes}
          completedZoneMinutes={completedZoneMinutes}
          maxZoneMinutes={maxZoneMinutes}
          showScheduled={showScheduled}
          showCompleted={showCompleted}
        />
      </div>

      <div
        className={`${METRICS_DESKTOP_ROW} border-t border-zinc-200 py-2 first:border-t-0 first:pt-0 dark:border-zinc-800`}
      >
        <div
          className={`${SPORT_COL_CLASS} text-xs font-medium ${isTotal ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-300"}`}
        >
          {sportLabel}
        </div>
        <div className={METRICS_MIDDLE_CLASS}>
          {showScheduled ? (
            <SummaryMetricCells
              row={scheduledRow}
              distanceLabel={scheduledDistanceLabel}
              side="scheduled"
            />
          ) : null}
          {showCompleted ? (
            <SummaryMetricCells
              row={completedRow}
              distanceLabel={completedDistanceLabel}
              side="completed"
            />
          ) : null}
        </div>
        <StackedTizColumn
          sportLabel={sportLabel}
          scheduledZoneMinutes={scheduledZoneMinutes}
          completedZoneMinutes={completedZoneMinutes}
          maxZoneMinutes={maxZoneMinutes}
          showScheduled={showScheduled}
          showCompleted={showCompleted}
        />
      </div>
    </>
  );
}

function emptySportRow(): WeekSportSummary {
  return {
    discipline: "BIKE",
    sessionCount: 0,
    plannedMinutes: 0,
    distanceMeters: 0,
    zoneMinutes: {},
    ecos: 0,
  };
}

function CombinedExpandedMetricsSection({
  scheduledSummary,
  completedSummary,
  disciplineSettings,
}: {
  scheduledSummary: WeekPlannedSummary | null;
  completedSummary: WeekPlannedSummary | null;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
}) {
  const hasScheduled = scheduledSummary ? weekSummaryHasData(scheduledSummary) : false;
  const hasCompleted = completedSummary ? weekSummaryHasData(completedSummary) : false;
  if (!hasScheduled && !hasCompleted) return null;

  const disciplines = SUMMARY_DISCIPLINE_ORDER;
  const sportRows = disciplines.map((discipline) => {
    const scheduledRow = scheduledSummary?.bySport.find((r) => r.discipline === discipline) ?? null;
    const completedRow = completedSummary?.bySport.find((r) => r.discipline === discipline) ?? null;
    const scheduledZones = scheduledRow
      ? sportZoneTotals(scheduledRow.discipline, scheduledRow.zoneMinutes)
      : [0, 0, 0, 0, 0];
    const completedZones = completedRow
      ? sportZoneTotals(completedRow.discipline, completedRow.zoneMinutes)
      : [0, 0, 0, 0, 0];
    return { discipline, scheduledRow, completedRow, scheduledZones, completedZones };
  });

  const scheduledTotalZones = scheduledSummary
    ? combinedZoneTotals(scheduledSummary.total.zoneMinutes)
    : [0, 0, 0, 0, 0];
  const completedTotalZones = completedSummary
    ? combinedZoneTotals(completedSummary.total.zoneMinutes)
    : [0, 0, 0, 0, 0];

  return (
    <div className="rounded-md border border-zinc-200 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-950/60">
      <MetricsDesktopHeader hasScheduled={hasScheduled} hasCompleted={hasCompleted} />
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800 sm:divide-y-0">
        {sportRows.map(({ discipline, scheduledRow, completedRow, scheduledZones, completedZones }) => (
          <CombinedSummaryRow
            key={discipline}
            sportLabel={DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline}
            showScheduled={hasScheduled}
            showCompleted={hasCompleted}
            scheduledRow={scheduledRow}
            completedRow={completedRow}
            scheduledDistanceLabel={
              scheduledRow
                ? formatSummaryDistance(
                    scheduledRow.discipline,
                    scheduledRow.distanceMeters,
                    disciplineSettings
                  )
                : "—"
            }
            completedDistanceLabel={
              completedRow
                ? formatSummaryDistance(
                    completedRow.discipline,
                    completedRow.distanceMeters,
                    disciplineSettings
                  )
                : "—"
            }
            scheduledZoneMinutes={scheduledZones}
            completedZoneMinutes={completedZones}
            maxZoneMinutes={maxZoneBarMinutes(scheduledZones, completedZones)}
          />
        ))}
        <CombinedSummaryRow
          sportLabel="Total"
          isTotal
          showScheduled={hasScheduled}
          showCompleted={hasCompleted}
          scheduledRow={scheduledSummary?.total ?? null}
          completedRow={completedSummary?.total ?? null}
          scheduledDistanceLabel={
            scheduledSummary
              ? formatTotalDistanceSummary(
                  scheduledSummary.total.distanceMeters,
                  disciplineSettings
                )
              : "—"
          }
          completedDistanceLabel={
            completedSummary
              ? formatTotalDistanceSummary(
                  completedSummary.total.distanceMeters,
                  disciplineSettings
                )
              : "—"
          }
          scheduledZoneMinutes={scheduledTotalZones}
          completedZoneMinutes={completedTotalZones}
          maxZoneMinutes={maxZoneBarMinutes(scheduledTotalZones, completedTotalZones)}
        />
      </div>
    </div>
  );
}

const SUMMARY_DISCIPLINE_ORDER: Discipline[] = ["BIKE", "RUN", "SWIM", "STRENGTH"];

function CollapsedCombinedMetrics({
  scheduledPills,
  completedPills,
  hasScheduled,
  hasCompleted,
}: {
  scheduledPills: CollapsedSummaryPill[];
  completedPills: CollapsedSummaryPill[];
  hasScheduled: boolean;
  hasCompleted: boolean;
}) {
  if (!hasScheduled && !hasCompleted) return null;

  if (hasScheduled && hasCompleted) {
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <CollapsedMetricsSection label="Scheduled" pills={scheduledPills} />
        <CollapsedMetricsSection label="Completed" pills={completedPills} />
      </div>
    );
  }

  return (
    <div className="mt-2">
      {hasScheduled ? (
        <CollapsedMetricsSection label="Scheduled" pills={scheduledPills} />
      ) : (
        <CollapsedMetricsSection label="Completed" pills={completedPills} />
      )}
    </div>
  );
}

const TARGET_DISCIPLINE_LABELS: Record<string, string> = {
  SWIM: "Swim",
  BIKE: "Bike",
  RUN: "Run",
};

function formatTargetHours(hours: number): string {
  if (hours <= 0) return "—";
  return `${formatDisplayNumber(hours, 1)} h`;
}

function WeekTargetSection({
  weekTarget,
  plannedSummary,
}: {
  weekTarget: CalendarWeekTarget;
  plannedSummary: WeekPlannedSummary;
}) {
  const rows = weekTarget.byDiscipline
    .map((entry) => {
      const targetZones = sportZoneTotals(entry.discipline, entry.zoneMinutes);
      const plannedRow = plannedSummary.bySport.find(
        (r) => r.discipline === entry.discipline
      );
      const plannedZones = plannedRow
        ? sportZoneTotals(entry.discipline, plannedRow.zoneMinutes)
        : [0, 0, 0, 0, 0];
      const remaining = remainingZoneArray(targetZones, plannedZones);
      return {
        discipline: entry.discipline,
        hours: entry.hours,
        sessionsPerWeek: entry.sessionsPerWeek,
        intenseDaysPerWeek: entry.intenseDaysPerWeek,
        targetZones,
        remaining,
      };
    })
    .filter(
      (row) =>
        row.hours > 0 ||
        row.targetZones.some((z) => z > 0) ||
        row.remaining.some((z) => z > 0)
    );

  const hasData = rows.length > 0 || weekTarget.totalHours > 0;
  if (!hasData) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-950/60">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          Season target
        </span>
        <span className="flex items-center gap-2 text-xs">
          {weekTarget.phase ? (
            <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-300">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: weekTarget.phase.color }}
                aria-hidden
              />
              {weekTarget.phase.name}
            </span>
          ) : null}
          {weekTarget.isRestWeek ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
              Rest week
            </span>
          ) : null}
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatTargetHours(weekTarget.totalHours)}
          </span>
        </span>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[4.5rem_3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-zinc-400 sm:grid">
          <span>Sport</span>
          <span className="text-right">Hours</span>
          <span>Target TiZ</span>
          <span>Zone budget left</span>
        </div>
        {rows.map((row) => {
          const maxMinutes = maxZoneBarMinutes(row.targetZones, row.remaining);
          const label = TARGET_DISCIPLINE_LABELS[row.discipline] ?? row.discipline;
          return (
            <div
              key={row.discipline}
              className="grid grid-cols-1 gap-1.5 border-t border-zinc-200 pt-2 first:border-t-0 first:pt-0 sm:grid-cols-[4.5rem_3.5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3 dark:border-zinc-800"
            >
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {label}
                {row.intenseDaysPerWeek > 0 ? (
                  <span className="ml-1 text-[10px] font-normal text-zinc-400">
                    {row.intenseDaysPerWeek} hard
                  </span>
                ) : null}
              </span>
              <span className="text-xs tabular-nums text-zinc-700 sm:text-right dark:text-zinc-200">
                {formatTargetHours(row.hours)}
              </span>
              <TizBarWithTooltip
                zoneMinutes={row.targetZones}
                maxMinutes={maxMinutes}
                title={`${label} target TiZ`}
              />
              <TizBarWithTooltip
                zoneMinutes={row.remaining}
                maxMinutes={maxMinutes}
                title={`${label} zone budget remaining`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type CalendarWeekSummaryProps = {
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  weekTarget?: CalendarWeekTarget | null;
  weekStart: string;
  currentWeekStart: string;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  defaultExpanded?: boolean;
  ecoLoadEnabled?: boolean;
  hideSeasonTarget?: boolean;
};

export function CalendarWeekSummary({
  sessions,
  activities,
  weekTarget,
  weekStart,
  currentWeekStart,
  disciplineSettings,
  defaultExpanded = false,
  ecoLoadEnabled = false,
  hideSeasonTarget = false,
}: CalendarWeekSummaryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const scheduledSummary = summarizeWeekPlannedSessions(sessions);
  const showCompleted = weekStart <= currentWeekStart;
  const completedSummary = showCompleted
    ? (() => {
        const excludedActivityIds = linkedActivityIdsExcludedFromCompletedRollup(sessions);
        const sessionSummary = summarizeWeekCompletedSessions(sessions);
        const activitySummary = summarizeWeekCompletedActivities(
          activities.filter((activity) => !excludedActivityIds.has(activity.id))
        );
        return mergeWeekSummaries(sessionSummary, activitySummary);
      })()
    : null;

  const hasScheduled = weekSummaryHasData(scheduledSummary);
  const hasCompleted = completedSummary ? weekSummaryHasData(completedSummary) : false;
  const hasTarget = !!weekTarget && !hideSeasonTarget;
  const hasEcos =
    ecoLoadEnabled &&
    ((completedSummary?.total.ecos ?? 0) > 0 || scheduledSummary.total.ecos > 0);

  if (!hasScheduled && !hasCompleted && !hasTarget && !hasEcos) return null;

  const scheduledPills = buildCollapsedWeekSummaryPills(scheduledSummary, disciplineSettings, {
    includeEcos: ecoLoadEnabled,
  });
  const completedPills = completedSummary
    ? buildCollapsedWeekSummaryPills(completedSummary, disciplineSettings, {
        includeEcos: ecoLoadEnabled,
      })
    : [];

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200/80 dark:hover:bg-zinc-800"
          aria-hidden
        >
          {expanded ? "▾" : "▸"}
        </span>
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Metrics</span>
      </button>

      {!expanded ? (
        <CollapsedCombinedMetrics
          scheduledPills={scheduledPills}
          completedPills={completedPills}
          hasScheduled={hasScheduled}
          hasCompleted={hasCompleted}
        />
      ) : (
        <div className="mt-3 space-y-2">
          {weekTarget && !hideSeasonTarget ? (
            <WeekTargetSection
              weekTarget={weekTarget}
              plannedSummary={scheduledSummary}
            />
          ) : null}
          {hasScheduled || hasCompleted ? (
            <CombinedExpandedMetricsSection
              scheduledSummary={hasScheduled ? scheduledSummary : null}
              completedSummary={hasCompleted ? completedSummary : null}
              disciplineSettings={disciplineSettings}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

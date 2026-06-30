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
  hasPlanned,
  hasCompleted,
}: {
  hasPlanned: boolean;
  hasCompleted: boolean;
}) {
  return (
    <div className={`${METRICS_DESKTOP_ROW} mb-2 border-b border-zinc-200 pb-2 dark:border-zinc-800`}>
      <span className={`${SPORT_COL_CLASS} text-[10px] font-medium uppercase tracking-wide text-zinc-400`}>
        Sport
      </span>
      <div className={METRICS_MIDDLE_CLASS}>
        {hasPlanned ? (
          <div className={METRIC_HEADER_TRIPLET}>
            <span className="col-span-3 text-zinc-600 dark:text-zinc-300">Planned</span>
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
  side: "planned" | "completed";
}) {
  const sideLabel = side === "planned" ? "Planned" : "Completed";

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
  plannedZoneMinutes,
  completedZoneMinutes,
  maxZoneMinutes,
  showPlanned,
  showCompleted,
}: {
  sportLabel: string;
  plannedZoneMinutes: number[];
  completedZoneMinutes: number[];
  maxZoneMinutes: number;
  showPlanned: boolean;
  showCompleted: boolean;
}) {
  return (
    <div className={`${TIZ_COL_CLASS} flex justify-end`}>
      <div className={`flex flex-col gap-2 ${TIZ_STACK_CLASS}`}>
        <span className="sr-only">Time in zone for {sportLabel}</span>
        {showPlanned ? (
          <TizBarRow
            sideLabel="Planned"
            tizTitle="Planned TiZ"
            zoneMinutes={plannedZoneMinutes}
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
  plannedRow,
  completedRow,
  plannedDistanceLabel,
  completedDistanceLabel,
  plannedZoneMinutes,
  completedZoneMinutes,
  maxZoneMinutes,
  showPlanned,
  showCompleted,
  isTotal,
}: {
  sportLabel: string;
  plannedRow: WeekSportSummary | null;
  completedRow: WeekSportSummary | null;
  plannedDistanceLabel: string;
  completedDistanceLabel: string;
  plannedZoneMinutes: number[];
  completedZoneMinutes: number[];
  maxZoneMinutes: number;
  showPlanned: boolean;
  showCompleted: boolean;
  isTotal?: boolean;
}) {
  const showRow =
    isTotal ||
    (showPlanned && rowHasData(plannedRow ?? emptySportRow(), plannedZoneMinutes)) ||
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
        {showPlanned ? (
          <SummaryMetricCells
            row={plannedRow}
            distanceLabel={plannedDistanceLabel}
            side="planned"
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
          plannedZoneMinutes={plannedZoneMinutes}
          completedZoneMinutes={completedZoneMinutes}
          maxZoneMinutes={maxZoneMinutes}
          showPlanned={showPlanned}
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
          {showPlanned ? (
            <SummaryMetricCells
              row={plannedRow}
              distanceLabel={plannedDistanceLabel}
              side="planned"
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
          plannedZoneMinutes={plannedZoneMinutes}
          completedZoneMinutes={completedZoneMinutes}
          maxZoneMinutes={maxZoneMinutes}
          showPlanned={showPlanned}
          showCompleted={showCompleted}
        />
      </div>
    </>
  );
}

function emptySportRow(): WeekSportSummary {
  return { discipline: "BIKE", sessionCount: 0, plannedMinutes: 0, distanceMeters: 0, zoneMinutes: {} };
}

function CombinedExpandedMetricsSection({
  plannedSummary,
  completedSummary,
  disciplineSettings,
}: {
  plannedSummary: WeekPlannedSummary | null;
  completedSummary: WeekPlannedSummary | null;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
}) {
  const hasPlanned = plannedSummary ? weekSummaryHasData(plannedSummary) : false;
  const hasCompleted = completedSummary ? weekSummaryHasData(completedSummary) : false;
  if (!hasPlanned && !hasCompleted) return null;

  const disciplines = SUMMARY_DISCIPLINE_ORDER;
  const sportRows = disciplines.map((discipline) => {
    const plannedRow = plannedSummary?.bySport.find((r) => r.discipline === discipline) ?? null;
    const completedRow = completedSummary?.bySport.find((r) => r.discipline === discipline) ?? null;
    const plannedZones = plannedRow ? sportZoneTotals(plannedRow.discipline, plannedRow.zoneMinutes) : [0, 0, 0, 0, 0];
    const completedZones = completedRow
      ? sportZoneTotals(completedRow.discipline, completedRow.zoneMinutes)
      : [0, 0, 0, 0, 0];
    return { discipline, plannedRow, completedRow, plannedZones, completedZones };
  });

  const plannedTotalZones = plannedSummary
    ? combinedZoneTotals(plannedSummary.total.zoneMinutes)
    : [0, 0, 0, 0, 0];
  const completedTotalZones = completedSummary
    ? combinedZoneTotals(completedSummary.total.zoneMinutes)
    : [0, 0, 0, 0, 0];

  return (
    <div className="rounded-md border border-zinc-200 bg-white/90 p-3 dark:border-zinc-700 dark:bg-zinc-950/60">
      <MetricsDesktopHeader hasPlanned={hasPlanned} hasCompleted={hasCompleted} />
      <div className="divide-y divide-zinc-200 dark:divide-zinc-800 sm:divide-y-0">
        {sportRows.map(({ discipline, plannedRow, completedRow, plannedZones, completedZones }) => (
          <CombinedSummaryRow
            key={discipline}
            sportLabel={DISCIPLINE_DISPLAY_LABELS[discipline] ?? discipline}
            showPlanned={hasPlanned}
            showCompleted={hasCompleted}
            plannedRow={plannedRow}
            completedRow={completedRow}
            plannedDistanceLabel={
              plannedRow
                ? formatSummaryDistance(
                    plannedRow.discipline,
                    plannedRow.distanceMeters,
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
            plannedZoneMinutes={plannedZones}
            completedZoneMinutes={completedZones}
            maxZoneMinutes={maxZoneBarMinutes(plannedZones, completedZones)}
          />
        ))}
        <CombinedSummaryRow
          sportLabel="Total"
          isTotal
          showPlanned={hasPlanned}
          showCompleted={hasCompleted}
          plannedRow={plannedSummary?.total ?? null}
          completedRow={completedSummary?.total ?? null}
          plannedDistanceLabel={
            plannedSummary
              ? formatTotalDistanceSummary(
                  plannedSummary.total.distanceMeters,
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
          plannedZoneMinutes={plannedTotalZones}
          completedZoneMinutes={completedTotalZones}
          maxZoneMinutes={maxZoneBarMinutes(plannedTotalZones, completedTotalZones)}
        />
      </div>
    </div>
  );
}

const SUMMARY_DISCIPLINE_ORDER: Discipline[] = ["BIKE", "RUN", "SWIM", "STRENGTH"];

function CollapsedCombinedMetrics({
  plannedPills,
  completedPills,
  hasPlanned,
  hasCompleted,
}: {
  plannedPills: CollapsedSummaryPill[];
  completedPills: CollapsedSummaryPill[];
  hasPlanned: boolean;
  hasCompleted: boolean;
}) {
  if (!hasPlanned && !hasCompleted) return null;

  if (hasPlanned && hasCompleted) {
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <CollapsedMetricsSection label="Planned" pills={plannedPills} />
        <CollapsedMetricsSection label="Completed" pills={completedPills} />
      </div>
    );
  }

  return (
    <div className="mt-2">
      {hasPlanned ? (
        <CollapsedMetricsSection label="Planned" pills={plannedPills} />
      ) : (
        <CollapsedMetricsSection label="Completed" pills={completedPills} />
      )}
    </div>
  );
}

type CalendarWeekSummaryProps = {
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  weekStart: string;
  currentWeekStart: string;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  defaultExpanded?: boolean;
};

export function CalendarWeekSummary({
  sessions,
  activities,
  weekStart,
  currentWeekStart,
  disciplineSettings,
  defaultExpanded = false,
}: CalendarWeekSummaryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const plannedSummary = summarizeWeekPlannedSessions(sessions);
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

  const hasPlanned = weekSummaryHasData(plannedSummary);
  const hasCompleted = completedSummary ? weekSummaryHasData(completedSummary) : false;

  if (!hasPlanned && !hasCompleted) return null;

  const plannedPills = buildCollapsedWeekSummaryPills(plannedSummary, disciplineSettings);
  const completedPills = completedSummary
    ? buildCollapsedWeekSummaryPills(completedSummary, disciplineSettings)
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
          plannedPills={plannedPills}
          completedPills={completedPills}
          hasPlanned={hasPlanned}
          hasCompleted={hasCompleted}
        />
      ) : (
        <div className="mt-3">
          <CombinedExpandedMetricsSection
            plannedSummary={hasPlanned ? plannedSummary : null}
            completedSummary={hasCompleted ? completedSummary : null}
            disciplineSettings={disciplineSettings}
          />
        </div>
      )}
    </div>
  );
}

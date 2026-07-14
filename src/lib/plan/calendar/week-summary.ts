import type { Discipline } from "@prisma/client";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import { DISCIPLINE_DISPLAY_LABELS, ENDURANCE_DISCIPLINES } from "@/lib/plan/discipline-labels";
import { sessionCompletionRollup } from "@/lib/plan/session-completion";
import type { PlanDiscipline } from "@/lib/plan/session";
import {
  type DisciplineUnitSettings,
  swimDisplayUnit,
} from "@/lib/units/discipline-settings";
import { formatSessionDistance } from "@/lib/workout/metrics";
import { formatZoneMinutes, zoneKey, type ZoneMinutes } from "@/lib/workout/steps";

const SUMMARY_DISCIPLINES: Discipline[] = ["BIKE", "RUN", "SWIM", "STRENGTH"];

export type WeekSportSummary = {
  discipline: Discipline;
  sessionCount: number;
  plannedMinutes: number;
  distanceMeters: number;
  zoneMinutes: ZoneMinutes;
  ecos: number;
};

export type WeekPlannedSummary = {
  bySport: WeekSportSummary[];
  total: WeekSportSummary;
};

function emptySportSummary(discipline: Discipline): WeekSportSummary {
  return {
    discipline,
    sessionCount: 0,
    plannedMinutes: 0,
    distanceMeters: 0,
    zoneMinutes: {},
    ecos: 0,
  };
}

export function summarizeWeekPlannedSessions(
  sessions: CalendarPlannedSession[]
): WeekPlannedSummary {
  const byDiscipline = new Map<Discipline, WeekSportSummary>();
  for (const d of SUMMARY_DISCIPLINES) {
    byDiscipline.set(d, emptySportSummary(d));
  }

  for (const session of sessions) {
    const discipline = session.discipline as Discipline;
    const row = byDiscipline.get(discipline) ?? emptySportSummary(discipline);
    row.sessionCount += 1;
    row.plannedMinutes += session.plannedMinutes;
    if (session.distanceMeters && session.distanceMeters > 0) {
      row.distanceMeters += session.distanceMeters;
    }
    for (const [key, minutes] of Object.entries(session.zoneMinutes)) {
      if (minutes > 0) {
        row.zoneMinutes[key] = (row.zoneMinutes[key] ?? 0) + minutes;
      }
    }
    byDiscipline.set(discipline, row);
  }

  const bySport = SUMMARY_DISCIPLINES.map((d) => byDiscipline.get(d)!);
  const total = emptySportSummary("BIKE");
  total.discipline = "BIKE";

  const totalZones: ZoneMinutes = {};
  for (const row of bySport) {
    total.sessionCount += row.sessionCount;
    total.plannedMinutes += row.plannedMinutes;
    total.distanceMeters += row.distanceMeters;
    total.ecos += row.ecos;
    for (const [key, minutes] of Object.entries(row.zoneMinutes)) {
      totalZones[key] = (totalZones[key] ?? 0) + minutes;
    }
  }
  total.zoneMinutes = totalZones;

  return { bySport, total };
}

export function summarizeWeekCompletedSessions(
  sessions: CalendarPlannedSession[]
): WeekPlannedSummary {
  const byDiscipline = new Map<Discipline, WeekSportSummary>();
  for (const d of SUMMARY_DISCIPLINES) {
    byDiscipline.set(d, emptySportSummary(d));
  }

  for (const session of sessions) {
    const rollup = sessionCompletionRollup({
      discipline: session.discipline as Discipline,
      completedDurationMinutes: session.completedDurationMinutes,
      completedDistanceMeters: session.completedDistanceMeters,
      completedTargetSpeedMps: session.completedTargetSpeedMps,
      completedTargetPaceSeconds: session.completedTargetPaceSeconds,
      completedZones: session.completedZones,
    });
    if (!rollup) continue;

    const row = byDiscipline.get(rollup.discipline) ?? emptySportSummary(rollup.discipline);
    row.sessionCount += 1;
    row.plannedMinutes += Math.round(rollup.durationMinutes);
    if (rollup.distanceMeters > 0) {
      row.distanceMeters += rollup.distanceMeters;
    }
    for (const [key, minutes] of Object.entries(rollup.zoneMinutes)) {
      if (minutes > 0) {
        row.zoneMinutes[key] = (row.zoneMinutes[key] ?? 0) + minutes;
      }
    }
    byDiscipline.set(rollup.discipline, row);
  }

  const bySport = SUMMARY_DISCIPLINES.map((d) => byDiscipline.get(d)!);
  const total = emptySportSummary("BIKE");
  total.discipline = "BIKE";

  const totalZones: ZoneMinutes = {};
  for (const row of bySport) {
    total.sessionCount += row.sessionCount;
    total.plannedMinutes += row.plannedMinutes;
    total.distanceMeters += row.distanceMeters;
    total.ecos += row.ecos;
    for (const [key, minutes] of Object.entries(row.zoneMinutes)) {
      totalZones[key] = (totalZones[key] ?? 0) + minutes;
    }
  }
  total.zoneMinutes = totalZones;

  return { bySport, total };
}

export function mergeWeekSummaries(...summaries: WeekPlannedSummary[]): WeekPlannedSummary {
  const byDiscipline = new Map<Discipline, WeekSportSummary>();
  for (const d of SUMMARY_DISCIPLINES) {
    byDiscipline.set(d, emptySportSummary(d));
  }

  for (const summary of summaries) {
    for (const row of summary.bySport) {
      const acc = byDiscipline.get(row.discipline) ?? emptySportSummary(row.discipline);
      acc.sessionCount += row.sessionCount;
      acc.plannedMinutes += row.plannedMinutes;
      acc.distanceMeters += row.distanceMeters;
      acc.ecos += row.ecos;
      for (const [key, minutes] of Object.entries(row.zoneMinutes)) {
        if (minutes > 0) {
          acc.zoneMinutes[key] = (acc.zoneMinutes[key] ?? 0) + minutes;
        }
      }
      byDiscipline.set(row.discipline, acc);
    }
  }

  const bySport = SUMMARY_DISCIPLINES.map((d) => byDiscipline.get(d)!);
  const total = emptySportSummary("BIKE");
  total.discipline = "BIKE";

  const totalZones: ZoneMinutes = {};
  for (const row of bySport) {
    total.sessionCount += row.sessionCount;
    total.plannedMinutes += row.plannedMinutes;
    total.distanceMeters += row.distanceMeters;
    total.ecos += row.ecos;
    for (const [key, minutes] of Object.entries(row.zoneMinutes)) {
      totalZones[key] = (totalZones[key] ?? 0) + minutes;
    }
  }
  total.zoneMinutes = totalZones;

  return { bySport, total };
}

export function linkedActivityIdsExcludedFromCompletedRollup(
  sessions: CalendarPlannedSession[]
): Set<string> {
  const excluded = new Set<string>();
  for (const session of sessions) {
    if (session.hasCompletedOverride && session.linkedActivity?.id) {
      excluded.add(session.linkedActivity.id);
    }
  }
  return excluded;
}

export function summarizeWeekCompletedActivities(
  activities: Array<{
    discipline: string;
    durationSeconds: number;
    distanceMeters: number | null;
    zoneMinutes: ZoneMinutes;
    ecos?: number | null;
  }>
): WeekPlannedSummary {
  const byDiscipline = new Map<Discipline, WeekSportSummary>();
  for (const d of SUMMARY_DISCIPLINES) {
    byDiscipline.set(d, emptySportSummary(d));
  }

  for (const activity of activities) {
    const discipline = activity.discipline as Discipline;
    const row = byDiscipline.get(discipline) ?? emptySportSummary(discipline);
    row.sessionCount += 1;
    row.plannedMinutes += Math.round(activity.durationSeconds / 60);
    if (activity.distanceMeters && activity.distanceMeters > 0) {
      row.distanceMeters += activity.distanceMeters;
    }
    if (activity.ecos != null && Number.isFinite(activity.ecos)) {
      row.ecos += activity.ecos;
    }
    for (const [key, minutes] of Object.entries(activity.zoneMinutes)) {
      if (minutes > 0) {
        row.zoneMinutes[key] = (row.zoneMinutes[key] ?? 0) + minutes;
      }
    }
    byDiscipline.set(discipline, row);
  }

  const bySport = SUMMARY_DISCIPLINES.map((d) => byDiscipline.get(d)!);
  const total = emptySportSummary("BIKE");
  total.discipline = "BIKE";

  const totalZones: ZoneMinutes = {};
  for (const row of bySport) {
    total.sessionCount += row.sessionCount;
    total.plannedMinutes += row.plannedMinutes;
    total.distanceMeters += row.distanceMeters;
    total.ecos += row.ecos;
    for (const [key, minutes] of Object.entries(row.zoneMinutes)) {
      totalZones[key] = (totalZones[key] ?? 0) + minutes;
    }
  }
  total.zoneMinutes = totalZones;

  return { bySport, total };
}

export function weekSummaryHasData(summary: WeekPlannedSummary): boolean {
  const totalZones = combinedZoneTotals(summary.total.zoneMinutes);
  return (
    summary.total.sessionCount > 0 ||
    summary.total.plannedMinutes > 0 ||
    summary.total.distanceMeters > 0 ||
    totalZones.some((z) => z > 0)
  );
}

export function formatSummaryDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  return formatZoneMinutes(minutes);
}

export function formatSummaryDistance(
  discipline: Discipline,
  meters: number,
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  if (meters <= 0) return "—";
  if (discipline === "STRENGTH") return "—";
  const unit =
    discipline === "SWIM"
      ? swimDisplayUnit(settings.SWIM.poolSize)
      : settings[discipline as PlanDiscipline].displayUnit;
  return formatSessionDistance(meters, discipline, unit) ?? "—";
}

function totalDistanceDisplayUnit(
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): "METRIC" | "IMPERIAL" {
  return settings.RUN?.displayUnit ?? settings.BIKE?.displayUnit ?? "METRIC";
}

export function formatTotalDistanceSummary(
  totalMeters: number,
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): string {
  if (totalMeters <= 0) return "—";
  const displayUnit = totalDistanceDisplayUnit(settings);
  return formatSessionDistance(totalMeters, "RUN", displayUnit) ?? "—";
}

export function combinedZoneTotals(zoneMinutes: ZoneMinutes): number[] {
  return [1, 2, 3, 4, 5].map((zone) =>
    ENDURANCE_DISCIPLINES.reduce(
      (sum, discipline) => sum + (zoneMinutes[zoneKey(discipline, zone)] ?? 0),
      0
    )
  );
}

export function sportZoneTotals(
  discipline: Discipline,
  zoneMinutes: ZoneMinutes
): number[] {
  return [1, 2, 3, 4, 5].map((zone) => zoneMinutes[zoneKey(discipline, zone)] ?? 0);
}

export function maxZoneBarMinutes(...zoneLists: number[][]): number {
  const max = zoneLists.reduce((m, zones) => Math.max(m, zones.reduce((s, z) => s + z, 0)), 0);
  return max || 1;
}

/** Per-zone remaining budget = target − planned, floored at 0. */
export function remainingZoneArray(target: number[], planned: number[]): number[] {
  return target.map((minutes, i) => Math.max(0, minutes - (planned[i] ?? 0)));
}

export type CollapsedSummaryPill = {
  id: string;
  label: string;
  text: string;
};

export function buildCollapsedWeekSummaryPills(
  summary: WeekPlannedSummary,
  settings: Record<PlanDiscipline, DisciplineUnitSettings>,
  options?: { includeEcos?: boolean }
): CollapsedSummaryPill[] {
  const pills: CollapsedSummaryPill[] = [];

  if (summary.total.plannedMinutes > 0) {
    pills.push({
      id: "total",
      label: "Total",
      text: formatSummaryDuration(summary.total.plannedMinutes),
    });
  }

  if (options?.includeEcos && summary.total.ecos > 0) {
    pills.push({
      id: "ecos",
      label: "ECO",
      text: `${Math.round(summary.total.ecos)} ECOs`,
    });
  }

  for (const row of summary.bySport) {
    const hasZoneTime = Object.values(row.zoneMinutes).some((m) => m > 0);
    const hasData =
      row.sessionCount > 0 ||
      row.plannedMinutes > 0 ||
      row.distanceMeters > 0 ||
      hasZoneTime ||
      (options?.includeEcos && row.ecos > 0);
    if (!hasData) continue;

    const label = DISCIPLINE_DISPLAY_LABELS[row.discipline] ?? row.discipline;
    const values: string[] = [];
    if (row.plannedMinutes > 0) {
      values.push(formatSummaryDuration(row.plannedMinutes));
    }
    const distance = formatSummaryDistance(row.discipline, row.distanceMeters, settings);
    if (distance !== "—") {
      values.push(distance);
    }
    if (options?.includeEcos && row.ecos > 0) {
      values.push(`${Math.round(row.ecos)} ECOs`);
    }
    if (values.length > 0) {
      pills.push({
        id: row.discipline,
        label,
        text: values.join(" "),
      });
    }
  }

  return pills;
}

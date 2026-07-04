"use client";

import { Card } from "@/components/ui";
import { formatGoalDisciplines, type Discipline, type EventPriority } from "@/components/season/season-settings-types";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";
import { formatDisciplineGoalTimesSummary } from "@/lib/plan/season/goal-event-times";
import { formatGoalRaceDistance } from "@/lib/plan/season/goal-race-distance";
import { useDisciplineSettings } from "@/lib/units/use-discipline-settings";

export type GoalEventSummary = {
  id: string;
  name: string;
  date: string;
  disciplines: Discipline[];
  priority: EventPriority;
  distanceMeters?: number | null;
  estimatedDurationMinutes?: number | null;
  swimGoalMinutes?: number | null;
  bikeGoalMinutes?: number | null;
  runGoalMinutes?: number | null;
};

export type SeasonSummary = {
  id: string;
  name: string;
  status: string;
  totalWeeks: number;
  startDate: string;
  endDate: string;
  totalPlannedHours: number;
  primaryGoalEvent?: {
    name: string;
    date: string;
    disciplines: Discipline[];
  } | null;
  goalEvents?: GoalEventSummary[];
};
type SeasonPlannerShellProps = {
  season: SeasonSummary;
  children: React.ReactNode;
};

export function SeasonPlannerShell({ season, children }: SeasonPlannerShellProps) {
  const { disciplineSettings } = useDisciplineSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Season dashboard</h1>
        <p className="text-sm text-zinc-500">
          {season.startDate} → {season.endDate} · {season.totalWeeks} weeks ·{" "}
          <span className="capitalize">{season.status.toLowerCase()}</span>
        </p>
      </div>

      <Card title="Season summary">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Total planned</dt>
            <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {season.totalPlannedHours} h
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Weeks</dt>
            <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {season.totalWeeks}
            </dd>
          </div>
          {season.primaryGoalEvent && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">A-race</dt>
              <dd className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {season.primaryGoalEvent.name} · {season.primaryGoalEvent.date}
                {season.primaryGoalEvent.disciplines.length > 0 && (
                  <span className="block text-sm font-normal text-zinc-500">
                    {formatGoalDisciplines(season.primaryGoalEvent.disciplines)}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
        {season.goalEvents && season.goalEvents.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Season races
            </p>
            <ul className="space-y-2">
              {[...season.goalEvents]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((event) => (
                  <li key={event.id} className="text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">{event.priority}-race:</span> {event.name} ·{" "}
                    {event.date}
                    {event.disciplines.length > 0 && (
                      <span className="text-zinc-500">
                        {" "}
                        · {formatGoalDisciplines(event.disciplines)}
                      </span>
                    )}
                    {(event.distanceMeters != null ||
                      event.estimatedDurationMinutes != null ||
                      formatDisciplineGoalTimesSummary(event.disciplines, event)) && (
                      <span className="block text-xs text-zinc-500">
                        {event.distanceMeters != null &&
                          formatGoalRaceDistance(
                            event.distanceMeters,
                            event.disciplines,
                            disciplineSettings
                          )}
                        {event.distanceMeters != null &&
                          (event.estimatedDurationMinutes != null ||
                            formatDisciplineGoalTimesSummary(event.disciplines, event)) &&
                          " · "}
                        {formatDisciplineGoalTimesSummary(event.disciplines, event) ??
                          (event.estimatedDurationMinutes != null &&
                            formatGoalTimeDisplay(event.estimatedDurationMinutes))}
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </Card>

      {children}
    </div>
  );
}

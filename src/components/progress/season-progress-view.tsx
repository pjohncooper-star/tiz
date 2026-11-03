import Link from "next/link";
import { Card } from "@/components/ui";
import { FitnessFatigueChart } from "@/components/fitness-fatigue-chart";
import {
  EmptyState,
  PhaseBadge,
  StatTile,
  ZoneComparison,
} from "@/components/progress/progress-primitives";
import { SeasonVolumeChart } from "@/components/progress/season-volume-chart";
import { formatMinutes, formatPercent, scoreTone, volumeTone } from "@/lib/progress/format";
import { progressHref } from "@/lib/progress/href";
import type { SeasonProgress } from "@/lib/progress/season-progress";

const PHASE_STATE_LABEL = { past: "Complete", current: "In progress", future: "Upcoming" } as const;

function daysAwayLabel(days: number): string {
  if (days === 0) return "Today";
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} to go`;
  return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
}

export function SeasonProgressView({
  progress,
  ecoEnabled,
}: {
  progress: SeasonProgress | null;
  ecoEnabled: boolean;
}) {
  if (!progress) {
    return (
      <EmptyState title="No active season">
        Create a season in{" "}
        <Link href="/plan" className="text-sky-600 hover:underline">
          Seasons
        </Link>{" "}
        to track progress against weekly targets.
      </EmptyState>
    );
  }

  const { toDate } = progress;
  const hasHistory = toDate.weekCount > 0;
  const currentWeek = progress.weeks.find((w) => w.state === "current");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{progress.name}</h2>
        <p className="text-sm text-zinc-500">
          {progress.startDate} to {progress.endDate} · {progress.totalWeeks} weeks
          {currentWeek ? ` · week ${(currentWeek.weekIndex ?? 0) + 1} in progress` : ""}
          {progress.futureWeeks > 0 ? ` · ${progress.futureWeeks} to go` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Volume to date"
          value={formatPercent(toDate.volumePercent)}
          tone={volumeTone(toDate.volumePercent)}
          detail={
            hasHistory
              ? `${formatMinutes(toDate.completedMinutes)} of ${formatMinutes(toDate.targetMinutes)} across ${toDate.weekCount} completed ${toDate.weekCount === 1 ? "week" : "weeks"}`
              : "No completed weeks yet"
          }
        />
        <StatTile
          label="Session adherence"
          value={formatPercent(toDate.adherencePercent)}
          tone={scoreTone(toDate.adherencePercent)}
          detail={
            hasHistory
              ? `${toDate.counts.done + toDate.counts.partial} done · ${toDate.counts.missed} missed · ${toDate.counts.extra} extra`
              : "No completed weeks yet"
          }
        />
        <StatTile
          label="Zone match"
          value={formatPercent(toDate.zoneMatchPercent)}
          tone={scoreTone(toDate.zoneMatchPercent)}
          detail="Target zone minutes covered, completed weeks"
        />
        <StatTile
          label="This week"
          value={currentWeek ? formatPercent(currentWeek.totals.volumePercent) : "—"}
          tone="neutral"
          detail={
            currentWeek ? (
              <Link
                href={progressHref({ view: "week", weekStart: currentWeek.weekStart })}
                className="text-sky-600 hover:underline"
              >
                {formatMinutes(currentWeek.totals.completedMinutes)} of{" "}
                {formatMinutes(currentWeek.totals.targetMinutes)} so far
              </Link>
            ) : (
              "Season is not in progress"
            )
          }
        />
      </div>

      <Card title="Weekly volume vs target">
        <SeasonVolumeChart progress={progress} />
      </Card>

      <Card title="Phases">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Phase</th>
                <th className="py-2 pr-4 font-medium">Weeks</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 text-right font-medium">Completed / target</th>
                <th className="py-2 pr-4 text-right font-medium">Volume</th>
                <th className="py-2 pr-4 text-right font-medium">Adherence</th>
                <th className="py-2 text-right font-medium">Zone match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {progress.phases.map((phase) => {
                const started = phase.pastWeeks > 0;
                return (
                  <tr key={phase.id}>
                    <td className="py-2.5 pr-4">
                      <PhaseBadge name={phase.name} color={phase.color} />
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {phase.pastWeeks} / {phase.totalWeeks}
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-600 dark:text-zinc-400">
                      {PHASE_STATE_LABEL[phase.state]}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {started
                        ? `${formatMinutes(phase.completedMinutes)} / ${formatMinutes(phase.targetMinutes)}`
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {started ? formatPercent(phase.volumePercent) : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {started ? formatPercent(phase.adherencePercent) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {started ? formatPercent(phase.zoneMatchPercent) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Phase figures cover completed weeks only. The week in progress is not counted against you.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Zone mix to date">
          {hasHistory ? (
            <ZoneComparison
              target={toDate.targetZones}
              planned={toDate.targetZones}
              actual={toDate.actualZones}
            />
          ) : (
            <p className="text-sm text-zinc-500">Available once a week has been completed.</p>
          )}
        </Card>

        <Card title="Goal races">
          {progress.goalEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">No races in this season.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {progress.goalEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{event.name}</p>
                    <p className="text-xs text-zinc-500">
                      {event.date} · {event.priority} race
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      event.daysAway < 0 ? "text-zinc-500" : "font-medium"
                    }`}
                  >
                    {daysAwayLabel(event.daysAway)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={ecoEnabled ? "Fitness and fatigue (ECO)" : "Fitness and fatigue (TiZ / hours)"}>
        <FitnessFatigueChart includePlan seasonId={progress.seasonId} />
      </Card>
    </div>
  );
}

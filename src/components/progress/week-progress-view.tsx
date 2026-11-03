import Link from "next/link";
import { Card } from "@/components/ui";
import {
  EmptyState,
  PhaseBadge,
  StatTile,
  StatusChip,
  VolumeBar,
  ZoneComparison,
} from "@/components/progress/progress-primitives";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import {
  formatMinutes,
  formatPercent,
  formatWeekRange,
  scoreTone,
  volumeTone,
} from "@/lib/progress/format";
import type { SelfEvalSummary } from "@/lib/progress/self-eval-summary";
import type { SessionCounts, WeekProgress } from "@/lib/progress/week-progress";

const STATE_LABEL = {
  past: "Completed week",
  current: "In progress",
  future: "Upcoming week",
} as const;

function countsDetail(counts: SessionCounts): string {
  const parts = [`${counts.done} done`];
  if (counts.partial > 0) parts.push(`${counts.partial} partial`);
  if (counts.missed > 0) parts.push(`${counts.missed} missed`);
  if (counts.upcoming > 0) parts.push(`${counts.upcoming} upcoming`);
  if (counts.extra > 0) parts.push(`${counts.extra} extra`);
  return parts.join(" · ");
}

function disciplineLabel(discipline: string): string {
  return (
    DISCIPLINE_DISPLAY_LABELS[discipline as keyof typeof DISCIPLINE_DISPLAY_LABELS] ?? discipline
  );
}

function SelfEvalStrip({ summary }: { summary: SelfEvalSummary }) {
  const metrics: Array<[string, number | null]> = [
    ["RPE", summary.rpe],
    ["Freshness", summary.freshness],
    ["Sleep", summary.sleep],
    ["Motivation", summary.motivation],
    ["Soreness", summary.soreness],
  ];
  return (
    <Card title="Self-evaluation">
      <p className="mb-3 text-xs text-zinc-500">
        Average across {summary.count} evaluated {summary.count === 1 ? "session" : "sessions"} this
        week.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {metrics
          .filter(([, value]) => value != null)
          .map(([label, value]) => (
            <div key={label}>
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
      </div>
    </Card>
  );
}

export function WeekProgressView({
  progress,
  selfEval,
  ecoEnabled,
  hrefByRowId,
}: {
  progress: WeekProgress;
  selfEval: SelfEvalSummary | null;
  ecoEnabled: boolean;
  hrefByRowId: Record<string, string>;
}) {
  const { totals, counts, state } = progress;
  const hasAnything =
    progress.hasTarget || progress.sessions.length > 0 || totals.completedMinutes > 0;
  const soFar = state === "current" ? " so far" : "";
  const volumeToneValue = state === "future" ? "neutral" : volumeTone(totals.volumePercent);
  const due = counts.done + counts.partial + counts.missed;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">
          {formatWeekRange(progress.weekStart, progress.weekEnd)}
        </h2>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {STATE_LABEL[state]}
        </span>
        {progress.phase ? <PhaseBadge name={progress.phase.name} color={progress.phase.color} /> : null}
        {progress.isRestWeek ? (
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
            De-load week
          </span>
        ) : null}
      </div>

      {!hasAnything ? (
        <EmptyState title="Nothing planned or completed this week">
          Add sessions on the{" "}
          <Link href="/calendar" className="text-sky-600 hover:underline">
            calendar
          </Link>{" "}
          or pick another week.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={`Volume${soFar}`}
              value={state === "future" ? "—" : formatPercent(totals.volumePercent)}
              tone={volumeToneValue}
              detail={
                progress.hasTarget
                  ? `${formatMinutes(totals.completedMinutes)} of ${formatMinutes(totals.targetMinutes)} target`
                  : `${formatMinutes(totals.completedMinutes)} completed · no season target`
              }
            />
            <StatTile
              label="Session adherence"
              value={formatPercent(progress.adherencePercent)}
              tone={scoreTone(progress.adherencePercent)}
              detail={
                due > 0
                  ? `${counts.done + counts.partial} of ${due} due sessions`
                  : "No sessions due yet"
              }
            />
            <StatTile
              label={`Zone match${soFar}`}
              value={state === "future" ? "—" : formatPercent(totals.zoneMatchPercent)}
              tone={state === "future" ? "neutral" : scoreTone(totals.zoneMatchPercent)}
              detail={
                totals.zoneMatchPercent == null
                  ? "No zone target for this week"
                  : "Target minutes covered in the right zones"
              }
            />
            {ecoEnabled ? (
              <StatTile
                label="Training load"
                value={totals.ecos > 0 ? `${Math.round(totals.ecos)} ECOs` : "—"}
                detail="From completed activities"
              />
            ) : (
              <StatTile
                label="Scheduled"
                value={formatMinutes(totals.plannedMinutes)}
                detail="Planned session time this week"
              />
            )}
          </div>

          <Card title="By sport">
            <div className="space-y-4">
              {progress.bySport.map((sport) => {
                const tone = state === "future" ? "neutral" : volumeTone(sport.volumePercent);
                const hasData =
                  sport.targetMinutes ||
                  sport.plannedMinutes > 0 ||
                  sport.completedMinutes > 0 ||
                  sport.counts.planned > 0;
                if (!hasData) return null;
                return (
                  <div key={sport.discipline} className="grid gap-2 sm:grid-cols-[6rem_1fr_16rem] sm:items-center sm:gap-4">
                    <p className="text-sm font-medium">{disciplineLabel(sport.discipline)}</p>
                    <VolumeBar
                      completed={sport.completedMinutes}
                      planned={sport.plannedMinutes}
                      target={sport.targetMinutes}
                      tone={tone}
                    />
                    <div className="text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatMinutes(sport.completedMinutes)}
                      </span>
                      {sport.targetMinutes ? ` of ${formatMinutes(sport.targetMinutes)}` : ""}
                      {sport.volumePercent != null && state !== "future"
                        ? ` (${formatPercent(sport.volumePercent)})`
                        : ""}
                      <span className="block text-[11px] text-zinc-500">
                        {formatMinutes(sport.plannedMinutes)} scheduled · {countsDetail(sport.counts)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {progress.strength ? (
                <div className="grid gap-2 sm:grid-cols-[6rem_1fr_16rem] sm:items-center sm:gap-4">
                  <p className="text-sm font-medium">Strength</p>
                  <p className="text-xs text-zinc-500 sm:col-span-1">Sessions only, no volume target</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {formatMinutes(progress.strength.completedMinutes)} completed ·{" "}
                    {countsDetail(progress.strength.counts)}
                  </p>
                </div>
              ) : null}
              <p className="text-[11px] text-zinc-500">
                Grey bar: scheduled sessions. Coloured bar: completed. Black marker: season target.
              </p>
            </div>
          </Card>

          <Card title="Time in zone">
            <ZoneComparison
              target={totals.targetZones}
              planned={totals.plannedZones}
              actual={totals.actualZones}
            />
          </Card>

          <Card title="Sessions">
            {progress.sessions.length === 0 ? (
              <p className="text-sm text-zinc-500">No sessions or activities in this week.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {progress.sessions.map((row) => {
                  const href = hrefByRowId[row.id];
                  const title = (
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {row.title}
                    </span>
                  );
                  return (
                    <li key={`${row.kind}-${row.id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="w-20 text-xs tabular-nums text-zinc-500">{row.date.slice(5)}</span>
                      <span className="w-16 text-xs text-zinc-500">{disciplineLabel(row.discipline)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {href ? (
                          <Link href={href} className="hover:underline">
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </span>
                      <span className="text-xs tabular-nums text-zinc-500">
                        {row.completedMinutes != null
                          ? `${formatMinutes(row.completedMinutes)}${
                              row.plannedMinutes ? ` / ${formatMinutes(row.plannedMinutes)}` : ""
                            }`
                          : formatMinutes(row.plannedMinutes)}
                      </span>
                      <StatusChip status={row.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {selfEval ? <SelfEvalStrip summary={selfEval} /> : null}
        </>
      )}
    </div>
  );
}

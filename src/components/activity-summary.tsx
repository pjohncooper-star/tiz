import type { SummaryStat } from "@/lib/activity/summary";

export function ActivitySummary({ stats }: { stats: SummaryStat[] }) {
  if (stats.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt className="text-xs text-zinc-500">{stat.label}</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

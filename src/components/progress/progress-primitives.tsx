import type { ReactNode } from "react";
import { formatMinuteDelta, formatMinutes, type ProgressTone } from "@/lib/progress/format";
import type { SessionProgressStatus } from "@/lib/progress/session-status";

const TONE_TEXT: Record<ProgressTone, string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  low: "text-red-600 dark:text-red-400",
  high: "text-amber-600 dark:text-amber-400",
  neutral: "text-zinc-900 dark:text-zinc-100",
};

const TONE_BAR: Record<ProgressTone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  low: "bg-red-500",
  high: "bg-amber-500",
  neutral: "bg-sky-500",
};

export const ZONE_BAR_CLASSES: Record<number, { solid: string; soft: string }> = {
  1: { solid: "bg-sky-500", soft: "bg-sky-200 dark:bg-sky-900/60" },
  2: { solid: "bg-green-500", soft: "bg-green-200 dark:bg-green-900/60" },
  3: { solid: "bg-yellow-500", soft: "bg-yellow-200 dark:bg-yellow-900/60" },
  4: { solid: "bg-orange-500", soft: "bg-orange-200 dark:bg-orange-900/60" },
  5: { solid: "bg-red-500", soft: "bg-red-200 dark:bg-red-900/60" },
};

export function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: ProgressTone;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${TONE_TEXT[tone]}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}

/** Completed bar with a target marker; the track is scaled so the marker never leaves it. */
export function VolumeBar({
  completed,
  planned,
  target,
  tone,
}: {
  completed: number;
  planned: number;
  target: number | null;
  tone: ProgressTone;
}) {
  const scale = Math.max(completed, planned, target ?? 0, 1);
  const pct = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  return (
    <div
      className="relative h-3 w-full rounded-full bg-zinc-100 dark:bg-zinc-800"
      role="img"
      aria-label={`Completed ${formatMinutes(completed)} of ${formatMinutes(target)} target, ${formatMinutes(planned)} planned`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-zinc-300 dark:bg-zinc-600"
        style={{ width: pct(planned) }}
      />
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${TONE_BAR[tone]}`}
        style={{ width: pct(completed) }}
      />
      {target != null && target > 0 ? (
        <div
          className="absolute -inset-y-0.5 w-0.5 bg-zinc-900 dark:bg-zinc-100"
          style={{ left: pct(target) }}
        />
      ) : null}
    </div>
  );
}

export function ZoneComparison({
  target,
  planned,
  actual,
}: {
  target: number[];
  planned: number[];
  actual: number[];
}) {
  const scale = Math.max(1, ...target, ...planned, ...actual);
  const width = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;
  const hasTarget = target.some((m) => m > 0);
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((zone) => {
        const t = target[zone - 1] ?? 0;
        const p = planned[zone - 1] ?? 0;
        const a = actual[zone - 1] ?? 0;
        const classes = ZONE_BAR_CLASSES[zone]!;
        return (
          <div key={zone} className="grid grid-cols-[2.5rem_1fr_9rem] items-center gap-3 text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Z{zone}</span>
            <div className="space-y-1">
              {hasTarget ? (
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className={`h-2 rounded-full ${classes.soft}`} style={{ width: width(t) }} />
                </div>
              ) : (
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className={`h-2 rounded-full ${classes.soft}`} style={{ width: width(p) }} />
                </div>
              )}
              <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className={`h-2 rounded-full ${classes.solid}`} style={{ width: width(a) }} />
              </div>
            </div>
            <div className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatMinutes(a)}</span>
              {hasTarget ? (
                <>
                  {" / "}
                  {formatMinutes(t)}
                  <span className="block text-[11px] text-zinc-500">{formatMinuteDelta(a - t)}</span>
                </>
              ) : (
                <>
                  {" / "}
                  {formatMinutes(p)}
                  <span className="block text-[11px] text-zinc-500">vs planned</span>
                </>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-500">
        Lighter bar: {hasTarget ? "season target" : "scheduled sessions"}. Solid bar: completed.
      </p>
    </div>
  );
}

const STATUS_STYLES: Record<SessionProgressStatus | "extra", { label: string; className: string }> = {
  done: {
    label: "Done",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  partial: {
    label: "Partial",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  missed: {
    label: "Missed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
  upcoming: {
    label: "Upcoming",
    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
  extra: {
    label: "Extra",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
};

export function StatusChip({ status }: { status: SessionProgressStatus | "extra" }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}

export function PhaseBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {children ? <div className="mt-2 text-sm text-zinc-500">{children}</div> : null}
    </div>
  );
}

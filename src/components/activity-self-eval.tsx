import type { DayQualityFlag, SurveySource } from "@prisma/client";
import {
  DAY_QUALITY_LABELS,
  formatWorkoutFeelLabel,
} from "@/lib/survey/fit-self-eval";

type ActivitySelfEvalProps = {
  rpe: number | null;
  freshness: number | null;
  dayQualityFlag: DayQualityFlag | null;
  source: SurveySource | null;
};

export function ActivitySelfEval({
  rpe,
  freshness,
  dayQualityFlag,
  source,
}: ActivitySelfEvalProps) {
  if (rpe == null && freshness == null && !dayQualityFlag) return null;

  const fromDevice = source === "FIT_IMPORT";

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {freshness != null && (
        <div>
          <dt className="text-xs text-zinc-500">How it felt</dt>
          <dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {formatWorkoutFeelLabel(freshness)}
          </dd>
        </div>
      )}
      {rpe != null && (
        <div>
          <dt className="text-xs text-zinc-500">Perceived effort</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {rpe}/10
          </dd>
        </div>
      )}
      {dayQualityFlag && (
        <div>
          <dt className="text-xs text-zinc-500">Day quality</dt>
          <dd className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {DAY_QUALITY_LABELS[dayQualityFlag]}
          </dd>
        </div>
      )}
      {fromDevice && (
        <div className="col-span-2 sm:col-span-3">
          <p className="text-xs text-zinc-500">Imported from your device workout evaluation</p>
        </div>
      )}
    </dl>
  );
}

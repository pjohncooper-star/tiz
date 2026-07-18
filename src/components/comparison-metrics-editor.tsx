"use client";

import type { PlanDiscipline } from "@/lib/plan/session";
import {
  paceInputLabel,
  reportingDistanceInputLabel,
  speedInputLabel,
} from "@/lib/workout/metrics";
import type { DisplayUnit } from "@/lib/workout/metrics";
import type { PoolSize } from "@/lib/units/discipline-settings";
import { useMetricsTriad } from "@/lib/plan/use-metrics-triad";
import type { PlannedMetricsTriadValues } from "@/lib/plan/planned-metrics-triad";
import { Input } from "@/components/ui";
import { TextEditorInput } from "@/components/number-editor-input";

const FIELD_CLASS =
  "box-border w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export type ComparisonMetricsEditorProps = {
  discipline: PlanDiscipline;
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
  planned: PlannedMetricsTriadValues;
  completed: PlannedMetricsTriadValues;
  onPlannedChange: (values: PlannedMetricsTriadValues) => void;
  onCompletedChange: (values: PlannedMetricsTriadValues) => void;
};

export function ComparisonMetricsEditor({
  discipline,
  displayUnit,
  poolSize,
  planned,
  completed,
  onPlannedChange,
  onCompletedChange,
}: ComparisonMetricsEditorProps) {
  const plannedTriad = useMetricsTriad(
    discipline,
    displayUnit,
    poolSize,
    planned,
    onPlannedChange,
    { syncFromProps: true }
  );
  const completedTriad = useMetricsTriad(
    discipline,
    displayUnit,
    poolSize,
    completed,
    onCompletedChange
  );

  const distanceLabel = reportingDistanceInputLabel(discipline, displayUnit);
  const paceLabel =
    discipline === "BIKE" ? speedInputLabel(displayUnit) : paceInputLabel(discipline, displayUnit);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-x-6 border-b border-zinc-200 pb-2 dark:border-zinc-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Planned</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Completed</p>
      </div>

      <dl className="space-y-3">
        <div>
          <dt className="text-xs text-zinc-500">Duration (min)</dt>
          <dd className="mt-1 grid grid-cols-2 gap-x-6">
            <TextEditorInput
              ariaLabel="Planned duration"
              placeholder="60"
              inputMode="decimal"
              className={FIELD_CLASS}
              value={plannedTriad.state.durationMinutes}
              onCommit={(raw) => plannedTriad.applyTriad("duration", { durationMinutes: raw })}
            />
            <TextEditorInput
              ariaLabel="Completed duration"
              placeholder="60"
              inputMode="decimal"
              className={FIELD_CLASS}
              value={completedTriad.state.durationMinutes}
              onCommit={(raw) => completedTriad.applyTriad("duration", { durationMinutes: raw })}
            />
          </dd>
        </div>

        <div>
          <dt className="text-xs text-zinc-500">{distanceLabel}</dt>
          <dd className="mt-1 grid grid-cols-2 gap-x-6">
            <TextEditorInput
              ariaLabel="Planned distance"
              inputMode="decimal"
              className={FIELD_CLASS}
              value={plannedTriad.distanceInput()}
              onCommit={(raw) => plannedTriad.setDistanceFromInput(raw)}
            />
            <TextEditorInput
              ariaLabel="Completed distance"
              inputMode="decimal"
              className={FIELD_CLASS}
              value={completedTriad.distanceInput()}
              onCommit={(raw) => completedTriad.setDistanceFromInput(raw)}
            />
          </dd>
        </div>

        <div>
          <dt className="text-xs text-zinc-500">{paceLabel}</dt>
          <dd className="mt-1 grid grid-cols-2 gap-x-6">
            {discipline === "BIKE" ? (
              <>
                <TextEditorInput
                  ariaLabel="Planned speed"
                  inputMode="decimal"
                  className={FIELD_CLASS}
                  value={plannedTriad.speedInput}
                  onCommit={(raw) => plannedTriad.setSpeedFromInput(raw)}
                />
                <TextEditorInput
                  ariaLabel="Completed speed"
                  inputMode="decimal"
                  className={FIELD_CLASS}
                  value={completedTriad.speedInput}
                  onCommit={(raw) => completedTriad.setSpeedFromInput(raw)}
                />
              </>
            ) : (
              <>
                <Input
                  className={FIELD_CLASS}
                  aria-label="Planned pace"
                  placeholder="5:00"
                  {...plannedTriad.paceInputHandlers()}
                />
                <Input
                  className={FIELD_CLASS}
                  aria-label="Completed pace"
                  placeholder="5:00"
                  {...completedTriad.paceInputHandlers()}
                />
              </>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

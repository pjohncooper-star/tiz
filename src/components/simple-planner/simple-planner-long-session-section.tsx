"use client";

import { Button, Input, Label } from "@/components/ui";
import {
  DEFAULT_LONG_SESSION_DEFAULTS,
  type SimpleLongSessionDefaults,
  type SimplePhase,
  type SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import { SimpleLongSessionChart } from "@/components/simple-planner/simple-long-session-chart";
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";

type SimplePlannerLongSessionSectionProps = {
  longSessionDefaults: SimpleLongSessionDefaults;
  phases: SimplePhase[];
  weeks: SimpleWeek[];
  totalWeeks: number;
  rampDefaults: SimpleRampDefaults;
  onChange: (value: SimpleLongSessionDefaults) => void;
  onRecalculate: () => void;
  saving: boolean;
};

export function SimplePlannerLongSessionSection({
  longSessionDefaults,
  phases,
  weeks,
  totalWeeks,
  rampDefaults,
  onChange,
  onRecalculate,
  saving,
}: SimplePlannerLongSessionSectionProps) {
  const defaults = longSessionDefaults ?? DEFAULT_LONG_SESSION_DEFAULTS;

  function updateField<K extends keyof SimpleLongSessionDefaults>(
    key: K,
    value: number
  ) {
    onChange({ ...defaults, [key]: value });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Long ride start (min)</Label>
          <Input
            type="number"
            min={1}
            className="mt-1"
            value={defaults.longRideStartMin}
            onChange={(event) => updateField("longRideStartMin", Number(event.target.value))}
          />
        </div>
        <div>
          <Label>Long ride peak (min)</Label>
          <Input
            type="number"
            min={1}
            className="mt-1"
            value={defaults.longRidePeakMin}
            onChange={(event) => updateField("longRidePeakMin", Number(event.target.value))}
          />
        </div>
        <div>
          <Label>Long run start (min)</Label>
          <Input
            type="number"
            min={1}
            className="mt-1"
            value={defaults.longRunStartMin}
            onChange={(event) => updateField("longRunStartMin", Number(event.target.value))}
          />
        </div>
        <div>
          <Label>Long run peak (min)</Label>
          <Input
            type="number"
            min={1}
            className="mt-1"
            value={defaults.longRunPeakMin}
            onChange={(event) => updateField("longRunPeakMin", Number(event.target.value))}
          />
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Per-phase long-session cadence is configured in Phases → Volume & recovery.
      </p>

      <SimpleLongSessionChart
        phases={phases}
        totalWeeks={totalWeeks}
        weeks={weeks}
        longDefaults={defaults}
        rampDefaults={rampDefaults}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={onRecalculate} disabled={saving}>
          {saving ? "Recalculating…" : "Recalculate long sessions"}
        </Button>
        <p className="text-xs text-zinc-500">
          Recomputes long ride/run minutes from season targets and phase cadence.
        </p>
      </div>
    </div>
  );
}

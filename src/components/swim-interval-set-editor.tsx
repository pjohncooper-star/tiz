"use client";

import type { Discipline } from "@prisma/client";
import { Button, Input, Label, Select } from "@/components/ui";
import type { PlanDiscipline } from "@/lib/plan/session";
import { poolSizeForSwimStep, type PoolSize } from "@/lib/units/discipline-settings";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  stepPaceCanonicalToInput,
  stepPaceInputLabel,
  stepPaceInputToCanonical,
} from "@/lib/workout/metrics";
import { formatSwimIntervalLabel } from "@/lib/workout/swim-interval-set";
import {
  formatDurationHms,
  parseDurationInput,
  type SwimIntervalSet,
} from "@/lib/workout/workout-tree";

type SwimIntervalSetEditorProps = {
  set: SwimIntervalSet;
  poolSize: PoolSize | null;
  displayUnit: DisplayUnit;
  targetView: "zone" | "pace_power" | "heart_rate";
  onChange: (next: SwimIntervalSet) => void;
  onRemove: () => void;
  canRemove: boolean;
  dense?: boolean;
};

function RestTimeInput({
  label,
  seconds,
  onCommit,
}: {
  label: string;
  seconds: number;
  onCommit: (seconds: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        defaultValue={formatDurationHms(seconds)}
        placeholder="1:30"
        onBlur={(e) => {
          const sec = parseDurationInput(e.target.value);
          if (sec != null && sec > 0) onCommit(sec);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

export function SwimIntervalSetEditor({
  set,
  poolSize,
  displayUnit,
  targetView,
  onChange,
  onRemove,
  canRemove,
  dense = false,
}: SwimIntervalSetEditorProps) {
  const swimPool = poolSizeForSwimStep(poolSize);
  const distanceLabel = swimPool === "SCY" ? "Distance (yd)" : "Distance (m)";
  const distanceStep = swimPool === "SCY" ? 25 : 50;
  const displayDistance =
    swimPool === "SCY"
      ? Math.round(set.distanceMeters * 1.09361)
      : Math.round(set.distanceMeters);

  const label = formatSwimIntervalLabel(set, poolSize, displayUnit);

  return (
    <div
      className={`rounded-md border border-cyan-200 bg-cyan-50/50 dark:border-cyan-900 dark:bg-cyan-950/20 ${
        dense ? "space-y-1.5 p-2" : "space-y-3 p-3"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`font-medium uppercase tracking-wide text-cyan-800 dark:text-cyan-300 ${
            dense ? "text-[10px]" : "text-xs"
          }`}
        >
          {label}
        </span>
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1 text-xs"
          disabled={!canRemove}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>

      <div className={`grid sm:grid-cols-2 ${dense ? "gap-2" : "gap-3"}`}>
        <div>
          <Label>Repeats</Label>
          <Input
            type="number"
            min={1}
            max={99}
            value={set.repeatCount}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1) onChange({ ...set, repeatCount: n });
            }}
          />
        </div>
        <div>
          <Label>{distanceLabel}</Label>
          <Input
            type="number"
            min={distanceStep}
            step={distanceStep}
            value={displayDistance}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v) || v <= 0) return;
              const meters = swimPool === "SCY" ? v / 1.09361 : v;
              onChange({ ...set, distanceMeters: meters });
            }}
          />
        </div>
      </div>

      <div className={`grid sm:grid-cols-2 ${dense ? "gap-2" : "gap-3"}`}>
        <div>
          <Label>Between reps</Label>
          <Select
            value={set.restMode}
            onChange={(e) => {
              const restMode = e.target.value as SwimIntervalSet["restMode"];
              if (restMode === "sendoff") {
                onChange({
                  ...set,
                  restMode,
                  sendOffSeconds: set.sendOffSeconds ?? 90,
                });
              } else {
                onChange({
                  ...set,
                  restMode,
                  fixedRestSeconds: set.fixedRestSeconds ?? 20,
                });
              }
            }}
          >
            <option value="sendoff">Leave on</option>
            <option value="fixed">Rest</option>
          </Select>
        </div>
        {set.restMode === "sendoff" ? (
          <RestTimeInput
            label="Leave on"
            seconds={set.sendOffSeconds ?? 90}
            onCommit={(sendOffSeconds) => onChange({ ...set, sendOffSeconds })}
          />
        ) : (
          <RestTimeInput
            label="Rest duration"
            seconds={set.fixedRestSeconds ?? 20}
            onCommit={(fixedRestSeconds) => onChange({ ...set, fixedRestSeconds })}
          />
        )}
      </div>

      {targetView === "zone" ? (
        <div>
          <Label>Pace zone</Label>
          <Select
            value={String(set.target.zone ?? 4)}
            onChange={(e) =>
              onChange({
                ...set,
                target: { signal: "pace", mode: "zone", zone: Number(e.target.value) },
              })
            }
          >
            {[1, 2, 3, 4, 5, 6, 7].map((z) => (
              <option key={z} value={z}>
                Zone {z}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {targetView === "pace_power" ? (
        <div>
          <Label>{stepPaceInputLabel("SWIM" as PlanDiscipline, displayUnit, poolSize)}</Label>
          <Input
            defaultValue={stepPaceCanonicalToInput(
              set.targetPaceSeconds,
              "SWIM" as PlanDiscipline,
              displayUnit,
              poolSize
            )}
            placeholder="1:30"
            onBlur={(e) => {
              const pace = stepPaceInputToCanonical(
                e.target.value,
                "SWIM" as PlanDiscipline,
                displayUnit,
                poolSize
              );
              onChange({
                ...set,
                target: { signal: "pace", mode: "value" },
                ...(pace ? { targetPaceSeconds: pace } : {}),
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

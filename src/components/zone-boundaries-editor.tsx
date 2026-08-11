"use client";

import { useMemo, useState } from "react";
import type { Discipline, SignalType } from "@prisma/client";
import { Label } from "@/components/ui";
import { NumberEditorInput } from "@/components/number-editor-input";
import {
  boundariesToEditorValues,
  editorValuesToBoundaries,
  validateEditorValues,
  zoneBoundariesFor,
} from "@/lib/zones/boundaries";
import { ZONE_COUNT } from "@/lib/zones/model";
import { formatPace } from "@/lib/units/pace";

type ZoneBoundariesEditorProps = {
  discipline: Discipline;
  signalType: SignalType;
  thresholdValue: number;
  zoneBoundaries: number[];
  displayUnit?: "METRIC" | "IMPERIAL";
  /** Called whenever cutoffs change and pass local validation. */
  onChange: (boundaries: number[]) => void;
  disabled?: boolean;
};

function cutoffLabel(signalType: SignalType, index: number): string {
  const from = index + 1;
  const to = index + 2;
  if (signalType === "PACE") {
    return `Z${from} / Z${to} (% of threshold speed)`;
  }
  return `Z${from} / Z${to} (% of threshold)`;
}

function absoluteHint(
  signalType: SignalType,
  discipline: Discipline,
  thresholdValue: number,
  storedSpeedOrIntensityPct: number,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (!(thresholdValue > 0)) return "";
  if (signalType === "POWER") {
    return `${Math.round((thresholdValue * storedSpeedOrIntensityPct) / 100)} W`;
  }
  if (signalType === "HEART_RATE") {
    return `${Math.round((thresholdValue * storedSpeedOrIntensityPct) / 100)} bpm`;
  }
  const unit =
    discipline === "SWIM"
      ? displayUnit === "METRIC"
        ? "100m"
        : "100yd"
      : displayUnit === "METRIC"
        ? "km"
        : "mi";
  const paceSec = (thresholdValue * 100) / storedSpeedOrIntensityPct;
  return `${formatPace(paceSec, unit)}/${unit}`;
}

export function ZoneBoundariesEditor({
  discipline,
  signalType,
  thresholdValue,
  zoneBoundaries,
  displayUnit = "METRIC",
  onChange,
  disabled,
}: ZoneBoundariesEditorProps) {
  const [error, setError] = useState("");
  const editorValues = useMemo(
    () => boundariesToEditorValues(signalType, zoneBoundaries),
    [signalType, zoneBoundaries]
  );

  function commitValues(next: number[]) {
    const validation = validateEditorValues(signalType, next, ZONE_COUNT);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    onChange(editorValuesToBoundaries(signalType, next));
  }

  function setValueAt(index: number, value: number) {
    const next = [...editorValues];
    next[index] = value;
    commitValues(next);
  }

  function resetDefaults() {
    commitValues(
      boundariesToEditorValues(signalType, zoneBoundariesFor(discipline, signalType))
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          Zone boundaries
          {signalType === "PACE"
            ? " (% of threshold speed)"
            : " (% of threshold)"}
        </Label>
        <button
          type="button"
          className="text-xs text-sky-600 hover:underline disabled:opacity-50"
          onClick={resetDefaults}
          disabled={disabled}
        >
          Reset to defaults
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        {signalType === "PACE"
          ? "Edit cutoffs as % of threshold speed (higher = faster), then shown as pace."
          : "Edit the upper cutoff of each zone as a percentage of threshold."}
      </p>
      <div className="space-y-2">
        {editorValues.map((value, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <span className="w-44 shrink-0 text-xs text-zinc-500">
              {cutoffLabel(signalType, index)}
            </span>
            <NumberEditorInput
              integer={false}
              step={0.1}
              className="w-28"
              value={Number.isFinite(value) ? value : 0}
              onCommit={(n) => {
                if (n != null) setValueAt(index, n);
              }}
            />
            <span className="text-xs text-zinc-500">
              {absoluteHint(
                signalType,
                discipline,
                thresholdValue,
                editorValues[index] ?? value,
                displayUnit
              )}
            </span>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

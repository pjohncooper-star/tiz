"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisplayUnit } from "@/lib/workout/metrics";
import type { PoolSize } from "@/lib/units/discipline-settings";
import { swimDisplayUnit } from "@/lib/units/discipline-settings";
import {
  reportingDistanceInputLabel,
  reportingDistanceInputToMeters,
  reportingDistanceMetersToInput,
  paceCanonicalToInput,
  paceInputLabel,
  paceInputToCanonical,
  speedInputLabel,
  speedInputToMps,
  speedMpsToInput,
} from "@/lib/workout/metrics";
import {
  durationMinutesToInput,
  parseDurationMinutesInput,
  reconcilePlannedMetricsTriad,
  type TriadField,
} from "@/lib/plan/planned-metrics-triad";
import { Input, Label } from "@/components/ui";
import { TextEditorInput } from "@/components/number-editor-input";

type PlannedMetricsFieldsProps = {
  discipline: PlanDiscipline;
  displayUnit: DisplayUnit;
  poolSize?: PoolSize | null;
  durationMinutes: string;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
  onDurationMinutesChange: (value: string) => void;
  onDistanceMetersChange: (value: number | null) => void;
  onTargetSpeedMpsChange: (value: number | null) => void;
  onTargetPaceSecondsChange: (value: number | null) => void;
  compact?: boolean;
};

const COMPACT_LABEL = "mb-0.5 block text-[10px] font-medium leading-none text-zinc-500";
const COMPACT_FIELD =
  "box-border w-full min-w-0 max-w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs leading-tight text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function MetricInputWrap({
  compact,
  showClear,
  onClear,
  children,
}: {
  compact: boolean;
  showClear: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${showClear ? "[&_input]:pr-5" : ""}`}>
      {children}
      {showClear ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Clear"
          className={`absolute top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 ${
            compact ? "right-1 text-xs leading-none" : "right-2 text-sm"
          }`}
          onClick={onClear}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function PlannedMetricsFields({
  discipline,
  displayUnit,
  poolSize = null,
  durationMinutes,
  distanceMeters,
  targetSpeedMps,
  targetPaceSeconds,
  onDurationMinutesChange,
  onDistanceMetersChange,
  onTargetSpeedMpsChange,
  onTargetPaceSecondsChange,
  compact = false,
}: PlannedMetricsFieldsProps) {
  const autoFieldRef = useRef<TriadField | null>(null);
  const paceFocusedRef = useRef(false);
  const [paceInputText, setPaceInputText] = useState("");
  const effectiveUnit =
    discipline === "SWIM" ? swimDisplayUnit(poolSize) : displayUnit;

  const distanceInput = reportingDistanceMetersToInput(
    distanceMeters,
    discipline,
    effectiveUnit
  );

  const distancePlaceholder =
    discipline === "SWIM"
      ? effectiveUnit === "METRIC"
        ? "1500"
        : "1650"
      : effectiveUnit === "METRIC"
        ? "40"
        : "25";

  useEffect(() => {
    autoFieldRef.current = null;
  }, [discipline]);

  useEffect(() => {
    if (discipline === "BIKE" || paceFocusedRef.current) return;
    setPaceInputText(
      paceCanonicalToInput(targetPaceSeconds, discipline as "RUN" | "SWIM", effectiveUnit)
    );
  }, [targetPaceSeconds, discipline, effectiveUnit]);

  function applyTriad(
    edited: TriadField,
    partial: {
      durationMinutes?: string;
      distanceMeters?: number | null;
      targetSpeedMps?: number | null;
      targetPaceSeconds?: number | null;
    }
  ) {
    const values = {
      durationMinutes: parseDurationMinutesInput(partial.durationMinutes ?? durationMinutes),
      distanceMeters: partial.distanceMeters !== undefined ? partial.distanceMeters : distanceMeters,
      targetSpeedMps:
        partial.targetSpeedMps !== undefined ? partial.targetSpeedMps : targetSpeedMps,
      targetPaceSeconds:
        partial.targetPaceSeconds !== undefined ? partial.targetPaceSeconds : targetPaceSeconds,
    };
    const { values: solved, autoField } = reconcilePlannedMetricsTriad(
      discipline,
      edited,
      values,
      autoFieldRef.current
    );
    autoFieldRef.current = autoField;
    onDurationMinutesChange(durationMinutesToInput(solved.durationMinutes));
    onDistanceMetersChange(solved.distanceMeters);
    if (discipline === "BIKE") {
      onTargetSpeedMpsChange(solved.targetSpeedMps);
      onTargetPaceSecondsChange(null);
    } else {
      onTargetPaceSecondsChange(solved.targetPaceSeconds);
      onTargetSpeedMpsChange(null);
    }
  }

  function clearField(field: TriadField) {
    if (autoFieldRef.current === field) {
      autoFieldRef.current = null;
    }
    if (field === "duration") {
      onDurationMinutesChange("");
      return;
    }
    if (field === "distance") {
      onDistanceMetersChange(null);
      return;
    }
    paceFocusedRef.current = false;
    setPaceInputText("");
    if (discipline === "BIKE") {
      onTargetSpeedMpsChange(null);
    } else {
      onTargetPaceSecondsChange(null);
    }
  }

  function handlePaceInputChange(raw: string) {
    setPaceInputText(raw);
    if (!raw.trim()) {
      applyTriad("pace", { targetPaceSeconds: null });
      return;
    }
    const canonical = paceInputToCanonical(raw, discipline as "RUN" | "SWIM", effectiveUnit);
    if (canonical !== null) {
      applyTriad("pace", { targetPaceSeconds: canonical });
    }
  }

  function paceInputHandlers() {
    return {
      value: paceInputText,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => handlePaceInputChange(e.target.value),
      onFocus: () => {
        paceFocusedRef.current = true;
      },
      onBlur: () => {
        paceFocusedRef.current = false;
        setPaceInputText(
          paceCanonicalToInput(targetPaceSeconds, discipline as "RUN" | "SWIM", effectiveUnit)
        );
      },
    };
  }

  const durationField = (
    <>
      {compact ? (
        <span className={COMPACT_LABEL}>Duration (min)</span>
      ) : (
        <Label>Duration (min)</Label>
      )}
      <MetricInputWrap
        compact={compact}
        showClear={durationMinutes.trim().length > 0}
        onClear={() => clearField("duration")}
      >
        <TextEditorInput
          value={durationMinutes}
          placeholder="60"
          inputMode="decimal"
          className={compact ? COMPACT_FIELD : undefined}
          onCommit={(raw) => applyTriad("duration", { durationMinutes: raw })}
        />
      </MetricInputWrap>
    </>
  );

  const distanceField = (
    <>
      {compact ? (
        <span className={COMPACT_LABEL}>
          {reportingDistanceInputLabel(discipline, effectiveUnit)}
        </span>
      ) : (
        <Label>{reportingDistanceInputLabel(discipline, effectiveUnit)}</Label>
      )}
      <MetricInputWrap
        compact={compact}
        showClear={distanceInput.length > 0}
        onClear={() => clearField("distance")}
      >
        <TextEditorInput
          value={distanceInput}
          placeholder={distancePlaceholder}
          inputMode="decimal"
          className={compact ? COMPACT_FIELD : undefined}
          onCommit={(raw) =>
            applyTriad("distance", {
              distanceMeters: reportingDistanceInputToMeters(
                raw,
                discipline,
                effectiveUnit
              ),
            })
          }
        />
      </MetricInputWrap>
    </>
  );

  const paceShowClear =
    discipline === "BIKE"
      ? speedMpsToInput(targetSpeedMps, effectiveUnit).length > 0
      : paceInputText.trim().length > 0;

  const paceField =
    discipline === "BIKE" ? (
      <>
        {compact ? (
          <span className={COMPACT_LABEL}>{speedInputLabel(effectiveUnit)}</span>
        ) : (
          <Label>{speedInputLabel(effectiveUnit)}</Label>
        )}
        <MetricInputWrap
          compact={compact}
          showClear={paceShowClear}
          onClear={() => clearField("pace")}
        >
          <TextEditorInput
            value={speedMpsToInput(targetSpeedMps, effectiveUnit)}
            placeholder={effectiveUnit === "METRIC" ? "30" : "18"}
            inputMode="decimal"
            className={compact ? COMPACT_FIELD : undefined}
            onCommit={(raw) =>
              applyTriad("pace", {
                targetSpeedMps: speedInputToMps(raw, effectiveUnit),
              })
            }
          />
        </MetricInputWrap>
      </>
    ) : (
      <>
        {compact ? (
          <span className={COMPACT_LABEL}>{paceInputLabel(discipline, effectiveUnit)}</span>
        ) : (
          <Label>{paceInputLabel(discipline, effectiveUnit)}</Label>
        )}
        <MetricInputWrap
          compact={compact}
          showClear={paceShowClear}
          onClear={() => clearField("pace")}
        >
          {compact ? (
            <input className={COMPACT_FIELD} placeholder="5:00" {...paceInputHandlers()} />
          ) : (
            <Input placeholder="5:00" {...paceInputHandlers()} />
          )}
        </MetricInputWrap>
      </>
    );

  if (compact) {
    return (
      <>
        <div>{durationField}</div>
        <div>{distanceField}</div>
        <div>{paceField}</div>
      </>
    );
  }

  return (
    <>
      <div>{durationField}</div>
      <div>{distanceField}</div>
      <div>{paceField}</div>
    </>
  );
}

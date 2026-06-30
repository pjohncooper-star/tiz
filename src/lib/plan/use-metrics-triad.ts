"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  paceCanonicalToInput,
  paceInputToCanonical,
  reportingDistanceInputToMeters,
  reportingDistanceMetersToInput,
  speedInputToMps,
  speedMpsToInput,
} from "@/lib/workout/metrics";
import type { PoolSize } from "@/lib/units/discipline-settings";
import { swimDisplayUnit } from "@/lib/units/discipline-settings";
import {
  durationMinutesToInput,
  parseDurationMinutesInput,
  reconcilePlannedMetricsTriad,
  type PlannedMetricsTriadValues,
  type TriadField,
} from "@/lib/plan/planned-metrics-triad";

export type MetricsTriadState = {
  durationMinutes: string;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
};

export function triadValuesFromState(state: MetricsTriadState): PlannedMetricsTriadValues {
  return {
    durationMinutes: parseDurationMinutesInput(state.durationMinutes),
    distanceMeters: state.distanceMeters,
    targetSpeedMps: state.targetSpeedMps,
    targetPaceSeconds: state.targetPaceSeconds,
  };
}

export function stateFromTriadValues(values: PlannedMetricsTriadValues): MetricsTriadState {
  return {
    durationMinutes: durationMinutesToInput(values.durationMinutes),
    distanceMeters: values.distanceMeters,
    targetSpeedMps: values.targetSpeedMps,
    targetPaceSeconds: values.targetPaceSeconds,
  };
}

export function useMetricsTriad(
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null,
  initial: PlannedMetricsTriadValues,
  onValuesChange?: (values: PlannedMetricsTriadValues) => void,
  options?: { syncFromProps?: boolean }
) {
  const effectiveUnit = discipline === "SWIM" ? swimDisplayUnit(poolSize) : displayUnit;
  const autoFieldRef = useRef<TriadField | null>(null);
  const paceFocusedRef = useRef(false);
  const [state, setState] = useState<MetricsTriadState>(() => stateFromTriadValues(initial));
  const [paceInputText, setPaceInputText] = useState(() =>
    discipline === "BIKE"
      ? ""
      : paceCanonicalToInput(initial.targetPaceSeconds, discipline as "RUN" | "SWIM", effectiveUnit)
  );

  useEffect(() => {
    autoFieldRef.current = null;
  }, [discipline]);

  useEffect(() => {
    if (!options?.syncFromProps) return;
    setState(stateFromTriadValues(initial));
  }, [
    options?.syncFromProps,
    initial.durationMinutes,
    initial.distanceMeters,
    initial.targetSpeedMps,
    initial.targetPaceSeconds,
  ]);

  useEffect(() => {
    if (!options?.syncFromProps || discipline === "BIKE" || paceFocusedRef.current) return;
    setPaceInputText(
      paceCanonicalToInput(state.targetPaceSeconds, discipline as "RUN" | "SWIM", effectiveUnit)
    );
  }, [state.targetPaceSeconds, discipline, effectiveUnit]);

  function commit(next: MetricsTriadState) {
    setState(next);
    onValuesChange?.(triadValuesFromState(next));
  }

  function applyTriad(
    edited: TriadField,
    partial: Partial<{
      durationMinutes: string;
      distanceMeters: number | null;
      targetSpeedMps: number | null;
      targetPaceSeconds: number | null;
    }>
  ) {
    const values = {
      durationMinutes: parseDurationMinutesInput(partial.durationMinutes ?? state.durationMinutes),
      distanceMeters:
        partial.distanceMeters !== undefined ? partial.distanceMeters : state.distanceMeters,
      targetSpeedMps:
        partial.targetSpeedMps !== undefined ? partial.targetSpeedMps : state.targetSpeedMps,
      targetPaceSeconds:
        partial.targetPaceSeconds !== undefined
          ? partial.targetPaceSeconds
          : state.targetPaceSeconds,
    };
    const { values: solved, autoField } = reconcilePlannedMetricsTriad(
      discipline,
      edited,
      values,
      autoFieldRef.current
    );
    autoFieldRef.current = autoField;
    const next = stateFromTriadValues(solved);
    if (discipline === "BIKE") {
      next.targetPaceSeconds = null;
    } else {
      next.targetSpeedMps = null;
    }
    commit(next);
    if (discipline !== "BIKE" && !paceFocusedRef.current) {
      setPaceInputText(
        paceCanonicalToInput(next.targetPaceSeconds, discipline as "RUN" | "SWIM", effectiveUnit)
      );
    }
  }

  function clearField(field: TriadField) {
    if (autoFieldRef.current === field) autoFieldRef.current = null;
    if (field === "duration") {
      commit({ ...state, durationMinutes: "" });
      return;
    }
    if (field === "distance") {
      commit({ ...state, distanceMeters: null });
      return;
    }
    paceFocusedRef.current = false;
    setPaceInputText("");
    if (discipline === "BIKE") {
      commit({ ...state, targetSpeedMps: null });
    } else {
      commit({ ...state, targetPaceSeconds: null });
    }
  }

  function distanceInput(): string {
    return reportingDistanceMetersToInput(state.distanceMeters, discipline, effectiveUnit);
  }

  function setDistanceFromInput(raw: string) {
    applyTriad("distance", {
      distanceMeters: reportingDistanceInputToMeters(raw, discipline, effectiveUnit),
    });
  }

  function paceInputHandlers() {
    return {
      value: paceInputText,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setPaceInputText(raw);
        if (!raw.trim()) {
          applyTriad("pace", { targetPaceSeconds: null });
          return;
        }
        const canonical = paceInputToCanonical(raw, discipline as "RUN" | "SWIM", effectiveUnit);
        if (canonical !== null) {
          applyTriad("pace", { targetPaceSeconds: canonical });
        }
      },
      onFocus: () => {
        paceFocusedRef.current = true;
      },
      onBlur: () => {
        paceFocusedRef.current = false;
        setPaceInputText(
          paceCanonicalToInput(state.targetPaceSeconds, discipline as "RUN" | "SWIM", effectiveUnit)
        );
      },
    };
  }

  return {
    effectiveUnit,
    state,
    applyTriad,
    clearField,
    distanceInput,
    setDistanceFromInput,
    paceInputHandlers,
    speedInput: speedMpsToInput(state.targetSpeedMps, effectiveUnit),
    setSpeedFromInput: (raw: string) =>
      applyTriad("pace", { targetSpeedMps: speedInputToMps(raw, effectiveUnit) }),
  };
}

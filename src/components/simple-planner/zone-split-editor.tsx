"use client";

import type { PhaseFocus, PhaseKind } from "@prisma/client";
import {
  disciplineSplitFocusId,
  disciplineZoneSplitSummary,
  endPercentsForDisciplineSplit,
  isFocusRampSplit,
  percentsForDisciplineSplit,
  percentsForFocusId,
  presetDisciplineZoneSplitById,
  startPercentsForDisciplineSplit,
} from "@/lib/plan/season/phase-zone-defaults";
import type {
  DisciplineZoneSplit,
  DisciplineZoneSplitCustomStyle,
  PhaseZoneSplits,
  TriPlanDiscipline,
  ZoneSplitPercents,
} from "@/lib/plan/season/zone-split-types";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { ZoneSplitPercentsSlider } from "@/components/zone-split-percents-slider";

const DISCIPLINE_ROWS: { key: TriPlanDiscipline; label: string }[] = [
  { key: "SWIM", label: "Swim" },
  { key: "BIKE", label: "Bike" },
  { key: "RUN", label: "Run" },
];

type ZoneSplitEditorProps = {
  value: PhaseZoneSplits;
  onChange: (value: PhaseZoneSplits) => void;
  catalog: ZoneFocusCatalog;
  compact?: boolean;
  showPresetPercents?: boolean;
  /** Show start/end TiZ % editors (phase pane). */
  showStartEnd?: boolean;
};

export function ZoneSplitEditor({
  value,
  onChange,
  catalog,
  compact = false,
  showPresetPercents = false,
  showStartEnd = false,
}: ZoneSplitEditorProps) {
  return (
    <div className="space-y-3">
      {DISCIPLINE_ROWS.map((row) => (
        <DisciplineZoneSplitRow
          key={row.key}
          label={row.label}
          split={value[row.key]}
          catalog={catalog}
          compact={compact}
          showPresetPercents={showPresetPercents}
          showStartEnd={showStartEnd}
          onChange={(split) => onChange({ ...value, [row.key]: split })}
        />
      ))}
    </div>
  );
}

function resolveCustomStyle(split: DisciplineZoneSplit): DisciplineZoneSplitCustomStyle {
  if (split.customStyle) return split.customStyle;
  if (isFocusRampSplit(split)) return "focus_ramp";
  return "manual";
}

function DisciplineZoneSplitRow({
  label,
  split,
  onChange,
  catalog,
  compact,
  showPresetPercents,
  showStartEnd,
}: {
  label: string;
  split: DisciplineZoneSplit;
  onChange: (split: DisciplineZoneSplit) => void;
  catalog: ZoneFocusCatalog;
  compact?: boolean;
  showPresetPercents?: boolean;
  showStartEnd?: boolean;
}) {
  const isCustom = split.mode === "custom";
  const customStyle = resolveCustomStyle(split);
  const summary = disciplineZoneSplitSummary(split, catalog);
  const focusId = disciplineSplitFocusId(split);
  const endPercents = endPercentsForDisciplineSplit(split, catalog);
  const startPercents = startPercentsForDisciplineSplit(split, catalog) ?? endPercents;

  function setPreset(id: string) {
    onChange(presetDisciplineZoneSplitById(id));
  }

  function catalogHasFocus(id: string): boolean {
    return catalog.some((entry) => entry.id === id);
  }

  function setCustomStyle(nextStyle: DisciplineZoneSplitCustomStyle) {
    if (nextStyle === "focus_ramp") {
      const startFocusId = split.startFocusId ?? focusId;
      const endFocusId = split.endFocusId ?? focusId;
      onChange({
        mode: "custom",
        customStyle: "focus_ramp",
        startFocusId,
        endFocusId,
        focusId: endFocusId,
        focus: catalogHasFocus(endFocusId) ? (endFocusId as PhaseFocus) : split.focus,
      });
      return;
    }

    onChange({
      mode: "custom",
      customStyle: "manual",
      focusId,
      focus: split.focus,
      percents: endPercents,
      endPercents,
      startPercents,
    });
  }

  function setFocusRampStart(id: string) {
    onChange({
      mode: "custom",
      customStyle: "focus_ramp",
      startFocusId: id,
      endFocusId: split.endFocusId ?? focusId,
      focusId: split.endFocusId ?? focusId,
    });
  }

  function setFocusRampEnd(id: string) {
    onChange({
      mode: "custom",
      customStyle: "focus_ramp",
      startFocusId: split.startFocusId ?? focusId,
      endFocusId: id,
      focusId: id,
      focus: catalogHasFocus(id) ? (id as PhaseFocus) : split.focus,
    });
  }

  function setCustomEndPercents(next: ZoneSplitPercents) {
    onChange({
      mode: "custom",
      customStyle: "manual",
      focusId,
      focus: focusId in catalog ? (focusId as PhaseFocus) : split.focus,
      percents: next,
      endPercents: next,
      startPercents: split.startPercents,
    });
  }

  function setCustomStartPercents(next: ZoneSplitPercents) {
    onChange({
      mode: "custom",
      customStyle: "manual",
      focusId,
      focus: focusId in catalog ? (focusId as PhaseFocus) : split.focus,
      percents: endPercents,
      endPercents,
      startPercents: next,
    });
  }

  function enterCustom() {
    if (showStartEnd) {
      setCustomStyle("focus_ramp");
      return;
    }
    const current = percentsForDisciplineSplit(split, catalog);
    onChange({
      mode: "custom",
      customStyle: "manual",
      focusId,
      focus: split.focus,
      percents: current,
      endPercents: current,
    });
  }

  function exitCustom() {
    onChange(presetDisciplineZoneSplitById(focusId));
  }

  const showSummary = !isCustom && (!compact || showPresetPercents);

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-sm font-medium">{label}</span>
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={isCustom ? "CUSTOM" : focusId}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "CUSTOM") {
              enterCustom();
              return;
            }
            setPreset(next);
          }}
        >
          {catalog.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
          <option value="CUSTOM">Custom</option>
        </select>
        {showSummary ? <span className="text-xs text-zinc-500">{summary}</span> : null}
      </div>

      {isCustom ? (
        <div className="mt-3 space-y-4">
          {showStartEnd ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Custom ramp style
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${label}-custom-style`}
                    checked={customStyle === "focus_ramp"}
                    onChange={() => setCustomStyle("focus_ramp")}
                  />
                  Ramp between focuses
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`${label}-custom-style`}
                    checked={customStyle === "manual"}
                    onChange={() => setCustomStyle("manual")}
                  />
                  Manual TiZ %
                </label>
              </div>
            </div>
          ) : null}

          {showStartEnd && customStyle === "focus_ramp" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Start focus (week 1)
                </p>
                <select
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={split.startFocusId ?? focusId}
                  onChange={(event) => setFocusRampStart(event.target.value)}
                >
                  {catalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Z3{" "}
                  {Math.round(
                    percentsForFocusId(split.startFocusId ?? focusId, catalog).z3
                  )}
                  %
                </p>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  End focus (last week)
                </p>
                <select
                  className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  value={split.endFocusId ?? focusId}
                  onChange={(event) => setFocusRampEnd(event.target.value)}
                >
                  {catalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Z3 {Math.round(percentsForFocusId(split.endFocusId ?? focusId, catalog).z3)}%
                </p>
              </div>
            </div>
          ) : null}

          {(!showStartEnd || customStyle === "manual") && (
            <div className="space-y-4">
              {showStartEnd ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Start TiZ % (week 1)
                  </p>
                  <ZoneSplitPercentsSlider
                    value={startPercents}
                    onChange={setCustomStartPercents}
                  />
                </div>
              ) : null}
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {showStartEnd ? "End TiZ % (last week)" : "Custom TiZ %"}
                </p>
                <ZoneSplitPercentsSlider value={endPercents} onChange={setCustomEndPercents} />
              </div>
            </div>
          )}

          <button
            type="button"
            className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
            onClick={exitCustom}
          >
            Back to preset focus
          </button>
        </div>
      ) : null}
      {isCustom ? <p className="mt-2 text-xs text-zinc-500">{summary}</p> : null}
    </div>
  );
}

type PhaseKindZoneDefaultsEditorProps = {
  value: Record<PhaseKind, PhaseZoneSplits>;
  onChange: (value: Record<PhaseKind, PhaseZoneSplits>) => void;
  catalog: ZoneFocusCatalog;
  showPresetPercents?: boolean;
};

export function PhaseKindZoneDefaultsEditor({
  value,
  onChange,
  catalog,
  showPresetPercents = false,
}: PhaseKindZoneDefaultsEditorProps) {
  const kinds: PhaseKind[] = ["BASE", "BUILD", "RACE_PREP", "TAPER"];
  const labels: Record<PhaseKind, string> = {
    BASE: "Base",
    BUILD: "Build",
    RACE_PREP: "Race prep",
    TAPER: "Taper",
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Default zone focus for each phase kind. New phases inherit these settings unless overridden
        in the Phases pane.
      </p>
      {kinds.map((kind) => (
        <div key={kind}>
          <h3 className="mb-2 text-sm font-semibold">{labels[kind]}</h3>
          <ZoneSplitEditor
            value={value[kind]}
            onChange={(splits) => onChange({ ...value, [kind]: splits })}
            catalog={catalog}
            compact
            showPresetPercents={showPresetPercents}
          />
        </div>
      ))}
    </div>
  );
}

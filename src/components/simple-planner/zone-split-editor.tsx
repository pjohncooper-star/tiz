"use client";

import type { PhaseFocus, PhaseKind } from "@prisma/client";
import {
  disciplineSplitFocusId,
  disciplineZoneSplitSummary,
  percentsForDisciplineSplit,
  presetDisciplineZoneSplitById,
} from "@/lib/plan/season/phase-zone-defaults";
import type {
  DisciplineZoneSplit,
  PhaseZoneSplits,
  TriPlanDiscipline,
  ZoneSplitPercents,
} from "@/lib/plan/season/zone-split-types";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { Input } from "@/components/ui";

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
};

export function ZoneSplitEditor({
  value,
  onChange,
  catalog,
  compact = false,
  showPresetPercents = false,
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
          onChange={(split) => onChange({ ...value, [row.key]: split })}
        />
      ))}
    </div>
  );
}

function DisciplineZoneSplitRow({
  label,
  split,
  onChange,
  catalog,
  compact,
  showPresetPercents,
}: {
  label: string;
  split: DisciplineZoneSplit;
  onChange: (split: DisciplineZoneSplit) => void;
  catalog: ZoneFocusCatalog;
  compact?: boolean;
  showPresetPercents?: boolean;
}) {
  const isCustom = split.mode === "custom";
  const summary = disciplineZoneSplitSummary(split, catalog);
  const focusId = disciplineSplitFocusId(split);

  function setPreset(id: string) {
    onChange(presetDisciplineZoneSplitById(id));
  }

  function setCustomPercents(patch: Partial<ZoneSplitPercents>) {
    const current = percentsForDisciplineSplit(split, catalog);
    const next = { ...current, ...patch };
    onChange({
      mode: "custom",
      focusId,
      focus: focusId in catalog ? (focusId as PhaseFocus) : split.focus,
      percents: next,
    });
  }

  function toggleCustom() {
    if (isCustom) {
      onChange(presetDisciplineZoneSplitById(focusId));
      return;
    }
    onChange({
      mode: "custom",
      focusId,
      focus: split.focus,
      percents: percentsForDisciplineSplit(split, catalog),
    });
  }

  const percents = percentsForDisciplineSplit(split, catalog);
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
              toggleCustom();
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
        <div className="mt-3 grid grid-cols-5 gap-2">
          {(["z1", "z2", "z3", "z4", "z5"] as const).map((key, index) => (
            <div key={key}>
              <span className="text-xs uppercase text-zinc-500">Z{index + 1} %</span>
              <Input
                type="number"
                min={0}
                max={100}
                className="mt-1"
                value={percents[key]}
                onChange={(event) =>
                  setCustomPercents({ [key]: Number(event.target.value) || 0 })
                }
              />
            </div>
          ))}
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

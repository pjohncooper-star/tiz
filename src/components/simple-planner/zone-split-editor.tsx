import type { PhaseFocus, PhaseKind } from "@prisma/client";
import { FOCUS_TIZ_PRESETS } from "@/lib/plan/season/constants";
import {
  disciplineZoneSplitSummary,
  focusLabel,
  normalizeZoneSplitPercents,
  percentsForDisciplineSplit,
  presetDisciplineZoneSplit,
} from "@/lib/plan/season/phase-zone-defaults";
import type {
  DisciplineZoneSplit,
  PhaseZoneSplits,
  TriPlanDiscipline,
  ZoneSplitPercents,
} from "@/lib/plan/season/zone-split-types";
import { Input } from "@/components/ui";

const PHASE_FOCUSES = Object.keys(FOCUS_TIZ_PRESETS) as PhaseFocus[];

const DISCIPLINE_ROWS: { key: TriPlanDiscipline; label: string }[] = [
  { key: "SWIM", label: "Swim" },
  { key: "BIKE", label: "Bike" },
  { key: "RUN", label: "Run" },
];

type ZoneSplitEditorProps = {
  value: PhaseZoneSplits;
  onChange: (value: PhaseZoneSplits) => void;
  compact?: boolean;
};

export function ZoneSplitEditor({ value, onChange, compact = false }: ZoneSplitEditorProps) {
  return (
    <div className="space-y-3">
      {DISCIPLINE_ROWS.map((row) => (
        <DisciplineZoneSplitRow
          key={row.key}
          label={row.label}
          split={value[row.key]}
          compact={compact}
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
  compact,
}: {
  label: string;
  split: DisciplineZoneSplit;
  onChange: (split: DisciplineZoneSplit) => void;
  compact?: boolean;
}) {
  const isCustom = split.mode === "custom";
  const summary = disciplineZoneSplitSummary(split);

  function setPreset(focus: PhaseFocus) {
    onChange(presetDisciplineZoneSplit(focus));
  }

  function setCustomPercents(patch: Partial<ZoneSplitPercents>) {
    const current = percentsForDisciplineSplit(split);
    const next = normalizeZoneSplitPercents({ ...current, ...patch });
    onChange({
      mode: "custom",
      focus: split.focus,
      percents: next,
    });
  }

  function toggleCustom() {
    if (isCustom) {
      onChange(presetDisciplineZoneSplit(split.focus ?? "AEROBIC_BASE"));
      return;
    }
    onChange({
      mode: "custom",
      focus: split.focus,
      percents: percentsForDisciplineSplit(split),
    });
  }

  const percents = percentsForDisciplineSplit(split);

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-sm font-medium">{label}</span>
        <select
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={isCustom ? "CUSTOM" : (split.focus ?? "AEROBIC_BASE")}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "CUSTOM") {
              toggleCustom();
              return;
            }
            setPreset(next as PhaseFocus);
          }}
        >
          {PHASE_FOCUSES.map((focus) => (
            <option key={focus} value={focus}>
              {focusLabel(focus)}
            </option>
          ))}
          <option value="CUSTOM">Custom</option>
        </select>
        {!isCustom && !compact ? (
          <span className="text-xs text-zinc-500">{summary}</span>
        ) : null}
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
      {isCustom ? (
        <p className="mt-2 text-xs text-zinc-500">{summary}</p>
      ) : null}
    </div>
  );
}

type PhaseKindZoneDefaultsEditorProps = {
  value: Record<PhaseKind, PhaseZoneSplits>;
  onChange: (value: Record<PhaseKind, PhaseZoneSplits>) => void;
};

export function PhaseKindZoneDefaultsEditor({
  value,
  onChange,
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
            compact
          />
        </div>
      ))}
    </div>
  );
}

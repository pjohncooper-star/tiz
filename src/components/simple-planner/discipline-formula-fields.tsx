"use client";

import Link from "next/link";
import { Label } from "@/components/ui";
import type { SimplePhase, SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import {
  emptyDisciplineFormulaIds,
  formulaForDiscipline,
  formulaLongSummary,
  formulaSessionSummary,
  formulaGrowthSummary,
  type DisciplineFormulaIds,
  type FormulaDiscipline,
  type SessionFormulaCatalog,
} from "@/lib/plan/season/base-formulas";
import { resolveChainedPhaseVolumeStart } from "@/lib/plan/season/phase-volume-display";
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import { roundHours } from "@/lib/plan/season/volume-curve";
import {
  formulaPhasePeakHours,
  formulaPhaseRate,
  type FormulaVolumePhase,
} from "@/lib/plan/season/simple-phase-volume";
import type { PlanningMode } from "@prisma/client";

const SETTINGS_HREF = "/settings/training#session-formulas";

export function phaseDisciplineStartHours(input: {
  phase: SimplePhase;
  phases: SimplePhase[];
  weeks: SimpleWeek[];
  rampDefaults: SimpleRampDefaults;
  effectiveMode: PlanningMode;
  discipline: "swim" | "bike" | "run";
}): number | null {
  const explicit =
    input.discipline === "swim"
      ? input.phase.swimStartHours
      : input.discipline === "bike"
        ? input.phase.bikeStartHours
        : input.phase.runStartHours;
  if (explicit != null) return explicit;
  const chained = resolveChainedPhaseVolumeStart({
    phase: input.phase,
    phases: input.phases,
    weeks: input.weeks,
    rampDefaults: input.rampDefaults,
    effectiveMode: input.effectiveMode,
    discipline: input.discipline,
  });
  return chained?.kind === "hours" ? chained.value : null;
}

export function DisciplineFormulaSelect({
  discipline,
  catalog,
  ids,
  onChange,
}: {
  discipline: FormulaDiscipline;
  catalog: SessionFormulaCatalog;
  ids: DisciplineFormulaIds | null | undefined;
  onChange: (ids: DisciplineFormulaIds) => void;
}) {
  const current = ids ?? emptyDisciplineFormulaIds();
  const selected = current[discipline];
  const options = catalog.filter((formula) => formula.discipline === discipline);
  const missing = Boolean(selected && !options.some((formula) => formula.id === selected));
  const resolved = formulaForDiscipline(catalog, current, discipline);

  return (
    <div className="mt-3">
      <Label>Session formula</Label>
      <select
        className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        value={selected ?? ""}
        onChange={(event) =>
          onChange({
            ...current,
            [discipline]: event.target.value || null,
          })
        }
      >
        <option value="">None</option>
        {missing && selected ? <option value={selected}>Removed formula</option> : null}
        {options.map((formula) => (
          <option key={formula.id} value={formula.id}>
            {formula.name}
          </option>
        ))}
      </select>
      {missing ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          This formula was removed. Clear it or pick another.
        </p>
      ) : null}
      {resolved ? (
        <p className="mt-1 text-xs text-zinc-500">
          <Link href={SETTINGS_HREF} className="text-sky-600 hover:underline">
            Edit in settings
          </Link>
          . Growth and peak are set on this phase. An empty peak uses the season peak.
        </p>
      ) : null}
    </div>
  );
}

const FORMULA_RAMP_KEY: Record<FormulaDiscipline, "swim" | "bike" | "run"> = {
  SWIM: "swim",
  BIKE: "bike",
  RUN: "run",
};

export function formulaVolumeReadout(
  catalog: SessionFormulaCatalog,
  ids: DisciplineFormulaIds | null | undefined,
  discipline: FormulaDiscipline,
  startHours: number | null,
  phase: FormulaVolumePhase,
  rampDefaults: SimpleRampDefaults
): string | null {
  const formula = formulaForDiscipline(catalog, ids, discipline);
  if (!formula) return null;
  const key = FORMULA_RAMP_KEY[discipline];
  const rate = formulaPhaseRate(phase, key);
  const peak = formulaPhasePeakHours(phase, key, rampDefaults);
  const growth = formulaGrowthSummary({
    ratePercent: rate.value,
    peakHours: peak.value,
    peakSource: peak.source,
  });
  return `${growth} ${formulaSessionSummary(formula, startHours)}`;
}

/** Placeholder for an empty phase peak: the season peak it falls back to. */
export function formulaSeasonPeakPlaceholder(
  discipline: FormulaDiscipline,
  phase: FormulaVolumePhase,
  rampDefaults: SimpleRampDefaults
): string {
  const peak = formulaPhasePeakHours(
    { ...phase, swimEndHours: null, bikeEndHours: null, runEndHours: null },
    FORMULA_RAMP_KEY[discipline],
    rampDefaults
  );
  return peak.value > 0 ? `Season ${roundHours(peak.value)} h` : "No cap";
}

export function formulaLongReadout(
  catalog: SessionFormulaCatalog,
  ids: DisciplineFormulaIds | null | undefined,
  discipline: FormulaDiscipline,
  startHours: number | null
): string | null {
  const formula = formulaForDiscipline(catalog, ids, discipline);
  if (!formula) return null;
  return formulaLongSummary(formula, startHours);
}

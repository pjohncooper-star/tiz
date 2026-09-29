"use client";

import Link from "next/link";
import { Label } from "@/components/ui";
import type { SimplePhase, SimpleWeek } from "@/components/simple-planner/simple-planner-types";
import {
  emptyDisciplineFormulaIds,
  formulaForDiscipline,
  formulaLongSummary,
  formulaSessionSummary,
  seasonGrowthSummary,
  type DisciplineFormulaIds,
  type FormulaDiscipline,
  type SessionFormulaCatalog,
} from "@/lib/plan/season/base-formulas";
import { resolveChainedPhaseVolumeStart } from "@/lib/plan/season/phase-volume-display";
import type { SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
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
          . Growth and peak are set per sport in Season → Advanced → Planning units.
        </p>
      ) : null}
    </div>
  );
}

const FORMULA_RAMP_KEY: Record<FormulaDiscipline, keyof SimpleRampDefaults> = {
  SWIM: "swim",
  BIKE: "bike",
  RUN: "run",
};

export function formulaVolumeReadout(
  catalog: SessionFormulaCatalog,
  ids: DisciplineFormulaIds | null | undefined,
  discipline: FormulaDiscipline,
  startHours: number | null,
  rampDefaults: SimpleRampDefaults
): string | null {
  const formula = formulaForDiscipline(catalog, ids, discipline);
  if (!formula) return null;
  const def = rampDefaults[FORMULA_RAMP_KEY[discipline]];
  return `${seasonGrowthSummary(def.ratePercent, def.peakHours)} ${formulaSessionSummary(formula, startHours)}`;
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

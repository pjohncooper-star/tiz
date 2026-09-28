import { type SimplePhase } from "@/components/simple-planner/simple-planner-types";
import {
  formulaForDiscipline,
  type FormulaDiscipline,
  type SessionFormulaCatalog,
} from "@/lib/plan/season/base-formulas";
import { isAssignedPhase } from "@/lib/plan/season/phase-span-utils";

const FORMULA_LABEL: Record<FormulaDiscipline, string> = {
  SWIM: "swim",
  BIKE: "bike",
  RUN: "run",
};

export type PhaseGenerateBlockerContext = {
  catalog?: SessionFormulaCatalog;
  templateItems?: Array<{ discipline: string }>;
};

export function phaseGenerateBlockers(
  phase: SimplePhase,
  context?: PhaseGenerateBlockerContext
): string[] {
  const blockers: string[] = [];
  if (!isAssignedPhase(phase)) {
    blockers.push("Assign this phase to weeks");
  }
  if (!phase.weeklyTemplateId) {
    blockers.push("Choose a weekly template");
  } else if (context?.catalog && context.templateItems) {
    for (const discipline of ["SWIM", "BIKE", "RUN"] as const) {
      const formula = formulaForDiscipline(
        context.catalog,
        phase.disciplineFormulaIds,
        discipline
      );
      if (!formula) continue;
      const count = context.templateItems.filter(
        (item) => item.discipline === discipline
      ).length;
      if (count !== formula.sessions.length) {
        const templateLabel = count === 1 ? "session" : "sessions";
        const formulaLabel = formula.sessions.length === 1 ? "session" : "sessions";
        blockers.push(
          `Weekly template has ${count} ${FORMULA_LABEL[discipline]} ${templateLabel}; formula has ${formula.sessions.length} ${formulaLabel}`
        );
      }
    }
  }
  return blockers;
}

export function phaseCanGenerateSessions(phase: SimplePhase): boolean {
  return phaseGenerateBlockers(phase).length === 0;
}

export function phaseGenerateBlockersForTemplate(
  phase: SimplePhase,
  catalog: SessionFormulaCatalog | undefined,
  templates: Array<{ id: string; items?: Array<{ discipline: string }> }>
): string[] {
  const template = phase.weeklyTemplateId
    ? templates.find((item) => item.id === phase.weeklyTemplateId)
    : undefined;
  return phaseGenerateBlockers(phase, {
    catalog,
    templateItems: template?.items,
  });
}

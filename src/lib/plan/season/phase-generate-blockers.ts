import { type SimplePhase } from "@/components/simple-planner/simple-planner-types";
import { isAssignedPhase } from "@/lib/plan/season/phase-span-utils";
import {
  mixShareError,
  type FormulaTemplateItem,
} from "@/lib/plan/calendar/template-formula-shape";
import type { FormulaDiscipline } from "@/lib/plan/season/base-formulas";

export type PhaseGenerateBlockerContext = {
  templateItems?: FormulaTemplateItem[];
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
  } else if (context?.templateItems) {
    for (const discipline of ["SWIM", "BIKE", "RUN"] as FormulaDiscipline[]) {
      const mixError = mixShareError(context.templateItems, discipline);
      if (mixError) blockers.push(mixError);
    }
  }
  return blockers;
}

export function phaseCanGenerateSessions(phase: SimplePhase): boolean {
  return phaseGenerateBlockers(phase).length === 0;
}

export function phaseGenerateBlockersForTemplate(
  phase: SimplePhase,
  templates: Array<{ id: string; items?: FormulaTemplateItem[] }>
): string[] {
  const template = phase.weeklyTemplateId
    ? templates.find((item) => item.id === phase.weeklyTemplateId)
    : undefined;
  return phaseGenerateBlockers(phase, {
    templateItems: template?.items,
  });
}

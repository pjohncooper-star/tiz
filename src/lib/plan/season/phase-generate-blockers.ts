import { type SimplePhase } from "@/components/simple-planner/simple-planner-types";
import { isAssignedPhase } from "@/lib/plan/season/phase-span-utils";

export function phaseGenerateBlockers(phase: SimplePhase): string[] {
  const blockers: string[] = [];
  if (!isAssignedPhase(phase)) {
    blockers.push("Assign this phase to weeks");
  }
  if (!phase.weeklyTemplateId) {
    blockers.push("Choose a weekly template");
  }
  return blockers;
}

export function phaseCanGenerateSessions(phase: SimplePhase): boolean {
  return phaseGenerateBlockers(phase).length === 0;
}

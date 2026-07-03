"use client";

import { CycleStructureStep } from "@/components/season/steps/cycle-structure-step";
import { GoalsTrainingDaysStep } from "@/components/season/steps/goals-training-days-step";
import { SeasonSetupStep } from "@/components/season/steps/season-setup-step";
import { VolumeRampDeloadStep } from "@/components/season/steps/volume-ramp-deload-step";
import { WorkoutsTemplatesStep } from "@/components/season/steps/workouts-templates-step";
import type { SeasonSettingsState } from "@/components/season/use-season-settings";

const STEP_PANELS = [
  SeasonSetupStep,
  CycleStructureStep,
  GoalsTrainingDaysStep,
  WorkoutsTemplatesStep,
  VolumeRampDeloadStep,
] as const;

export function SeasonSettingsPanel({
  step,
  state,
}: {
  step: number;
  state: SeasonSettingsState;
}) {
  const Panel = STEP_PANELS[step];
  if (!Panel) return null;
  return <Panel state={state} />;
}

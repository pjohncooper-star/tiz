import type { FitExportThresholds } from "@/lib/workout/fit-target-codec";
import type { LeafStep } from "@/lib/workout/workout-tree";
import {
  seedSwimEquipmentCatalog,
  swimEquipmentLabels,
} from "@/lib/swim/equipment-catalog";

/** Build the Garmin FIT workout-step notes string from free text + equipment. */
export function formatFitStepNotes(
  step: Pick<LeafStep, "notes" | "equipment">,
  thresholds: Pick<FitExportThresholds, "swimEquipmentCatalog"> = {}
): string | undefined {
  const parts: string[] = [];
  if (step.notes?.trim()) parts.push(step.notes.trim());
  if (step.equipment && step.equipment.length > 0) {
    const catalog = thresholds.swimEquipmentCatalog ?? seedSwimEquipmentCatalog();
    const labels = swimEquipmentLabels(step.equipment, catalog);
    if (labels.length > 0) parts.push(`Equipment: ${labels.join(", ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

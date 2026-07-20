import type { WeeklyTemplateKind } from "@prisma/client";

/**
 * Template categories are organizing labels for the reusable library — they do
 * not constrain where a template can be assigned. `DEFAULT` is the catch-all
 * "General" bucket (and the category of folded-in legacy templates).
 */
export const TEMPLATE_CATEGORIES: WeeklyTemplateKind[] = [
  "DEFAULT",
  "PHASE",
  "REST",
  "TEST",
];

export const TEMPLATE_CATEGORY_LABELS: Record<WeeklyTemplateKind, string> = {
  DEFAULT: "General",
  PHASE: "Phase",
  REST: "Rest week",
  TEST: "Test week",
};

export function templateCategoryLabel(category: WeeklyTemplateKind): string {
  return TEMPLATE_CATEGORY_LABELS[category] ?? category;
}

import type { ComponentType } from "@prisma/client";

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  WARMUP: "Warm up",
  PRIMER: "Primer",
  MAIN_SET: "Main set",
  COOLDOWN: "Cool down",
  DRILL: "Drill",
  RECOVERY: "Recovery",
  OTHER: "Other",
};

export const COMPONENT_TYPES = Object.keys(COMPONENT_TYPE_LABELS) as ComponentType[];

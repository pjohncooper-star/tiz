import type { DisplayUnit } from "@prisma/client";
import type { PlanDiscipline } from "@/lib/plan/session";

export type PoolSize = "SCY" | "SCM" | "LCM";

export type DisciplineUnitSettings = {
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
};

export const POOL_SIZE_OPTIONS: { value: PoolSize; label: string }[] = [
  { value: "SCY", label: "SCY (25y)" },
  { value: "SCM", label: "SCM (25m)" },
  { value: "LCM", label: "LCM (50m)" },
];

export const DEFAULT_DISCIPLINE_UNIT_SETTINGS: Record<PlanDiscipline, DisciplineUnitSettings> = {
  BIKE: { displayUnit: "METRIC", poolSize: null },
  RUN: { displayUnit: "METRIC", poolSize: null },
  SWIM: { displayUnit: "METRIC", poolSize: "SCM" },
};

export function poolSizeForSwimStep(poolSize: PoolSize | null | undefined): PoolSize {
  return poolSize ?? "SCM";
}

export function poolSizeStepIncrement(poolSize: PoolSize): number {
  return poolSize === "LCM" ? 50 : 25;
}

export function swimDisplayUnit(poolSize: PoolSize | null | undefined): DisplayUnit {
  return poolSizeForSwimStep(poolSize) === "SCY" ? "IMPERIAL" : "METRIC";
}

export function resolveSessionPoolSize(
  discipline: string,
  sessionPoolSize: PoolSize | null | undefined,
  settings: Partial<Record<PlanDiscipline, DisciplineUnitSettings>>
): PoolSize | null;
export function resolveSessionPoolSize(
  discipline: string,
  sessionPoolSize: PoolSize | null | undefined,
  defaultPoolSize: PoolSize | null | undefined
): PoolSize | null;
export function resolveSessionPoolSize(
  discipline: string,
  sessionPoolSize: PoolSize | null | undefined,
  settingsOrDefault:
    | Partial<Record<PlanDiscipline, DisciplineUnitSettings>>
    | PoolSize
    | null
    | undefined
): PoolSize | null {
  if (discipline !== "SWIM") return null;
  if (sessionPoolSize) return sessionPoolSize;
  if (
    settingsOrDefault &&
    typeof settingsOrDefault === "object" &&
    "SWIM" in settingsOrDefault
  ) {
    return unitSettingsForDiscipline("SWIM", settingsOrDefault).poolSize ?? "SCM";
  }
  return poolSizeForSwimStep(settingsOrDefault as PoolSize | null | undefined);
}

export function unitSettingsForDiscipline(
  discipline: PlanDiscipline | "STRENGTH",
  settings: Partial<Record<PlanDiscipline, DisciplineUnitSettings>>
): DisciplineUnitSettings {
  if (discipline === "STRENGTH") {
    return { displayUnit: "METRIC", poolSize: null };
  }
  return settings[discipline] ?? DEFAULT_DISCIPLINE_UNIT_SETTINGS[discipline];
}

export function buildDisciplineSettings(
  rows: Array<{
    discipline: string;
    displayUnit: DisplayUnit;
    poolSize: PoolSize | null;
  }>
): Record<PlanDiscipline, DisciplineUnitSettings> {
  const result = { ...DEFAULT_DISCIPLINE_UNIT_SETTINGS };
  for (const row of rows) {
    if (row.discipline !== "BIKE" && row.discipline !== "RUN" && row.discipline !== "SWIM") {
      continue;
    }
    const discipline = row.discipline as PlanDiscipline;
    result[discipline] = {
      displayUnit: row.displayUnit,
      poolSize: discipline === "SWIM" ? poolSizeForSwimStep(row.poolSize) : null,
    };
  }
  return result;
}

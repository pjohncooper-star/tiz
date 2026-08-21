import { eachDateKey } from "@/lib/dates";

/** Literature ECS scale: 0–5 with half-point steps (Cejuela & Esteve-Lanao). */
export const ECS_MIN = 0;
export const ECS_MAX = 5;
export const ECS_STEP = 0.5;

export const ECS_VALUES: readonly number[] = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
];

/** Bompa-style daily load labels for integer and half steps. */
export const ECS_LABELS: Record<number, string> = {
  0: "Rest",
  0.5: "Very light",
  1: "Light",
  1.5: "Light–medium",
  2: "Medium",
  2.5: "Medium–high",
  3: "High",
  3.5: "High–very high",
  4: "Very high",
  4.5: "Near maximal",
  5: "Maximal",
};

export type DailyEcsPoint = {
  date: string;
  ecs: number;
};

export function isValidEcs(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < ECS_MIN || value > ECS_MAX) return false;
  // Allow exact half-steps only (avoid float drift via rounding to 0.1 first).
  const tenths = Math.round(value * 10);
  return tenths % 5 === 0;
}

export function normalizeEcs(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 2) / 2;
  return isValidEcs(rounded) ? rounded : null;
}

export function ecsLabel(ecs: number): string {
  const key = normalizeEcs(ecs);
  if (key == null) return "";
  return ECS_LABELS[key] ?? String(key);
}

export function formatEcsDisplay(ecs: number): string {
  const n = normalizeEcs(ecs);
  if (n == null) return "";
  const label = ecsLabel(n);
  return label ? `${n} · ${label}` : String(n);
}

/** Sum ECS values that fall in [from, to] inclusive (date keys). Missing days contribute 0. */
export function sumEcsInRange(
  points: DailyEcsPoint[],
  from: string,
  to: string
): number {
  if (from > to) return 0;
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (!isValidEcs(p.ecs)) continue;
    if (p.date < from || p.date > to) continue;
    byDate.set(p.date, p.ecs);
  }
  let sum = 0;
  for (const date of eachDateKey(from, to)) {
    sum += byDate.get(date) ?? 0;
  }
  return sum;
}

/** Sum only logged days (does not invent 0 for gaps). */
export function sumLoggedEcs(points: DailyEcsPoint[]): number {
  let sum = 0;
  for (const p of points) {
    if (isValidEcs(p.ecs)) sum += p.ecs;
  }
  return sum;
}

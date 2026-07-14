/** Sum session ECO scores, ignoring nulls. */
export function sumEcos(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const v of values) {
    if (v != null && Number.isFinite(v)) total += v;
  }
  return total;
}

export function formatEcos(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

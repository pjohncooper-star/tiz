/** Locale-aware number with grouping; whole values omit fractional digits. */
export function formatDisplayNumber(value: number, maxFractionDigits = 1): string {
  const factor = 10 ** maxFractionDigits;
  const rounded = Math.round(value * factor) / factor;
  const isWhole = Number.isInteger(rounded);
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: isWhole ? 0 : maxFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  });
}

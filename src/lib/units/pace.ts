/** Canonical pace: sec/km (run), sec/100m (swim). Speed never persists. */

const METERS_PER_MILE = 1609.344;
const METERS_PER_100YD = 91.44;

export function velocityToPaceSecPerKm(velocityMps: number): number | null {
  if (!velocityMps || velocityMps <= 0) return null;
  return 1000 / velocityMps;
}

export function velocityToPaceSecPer100m(velocityMps: number): number | null {
  if (!velocityMps || velocityMps <= 0) return null;
  return 100 / velocityMps;
}

export function formatPace(secPerUnit: number, unit: "km" | "mi" | "100m" | "100yd"): string {
  let seconds = secPerUnit;
  if (unit === "mi") seconds = secPerUnit * (METERS_PER_MILE / 1000);
  if (unit === "100yd") seconds = secPerUnit * (METERS_PER_100YD / 100);
  return formatMinSec(seconds);
}

/** mm:ss from canonical sec/km (run) or sec/100m (swim). */
export function thresholdPaceToInput(
  thresholdValue: number,
  discipline: "RUN" | "SWIM",
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (discipline === "SWIM") {
    return formatPace(thresholdValue, displayUnit === "METRIC" ? "100m" : "100yd");
  }
  return formatPace(thresholdValue, displayUnit === "METRIC" ? "km" : "mi");
}

/** Parse mm:ss pace input to canonical sec/km (run) or sec/100m (swim). */
export function parseThresholdPaceInput(
  input: string,
  discipline: "RUN" | "SWIM",
  displayUnit: "METRIC" | "IMPERIAL"
): number | null {
  const secPerUnit = parsePaceInput(input);
  if (secPerUnit === null) return null;
  if (discipline === "SWIM") {
    return displayUnit === "METRIC"
      ? secPerUnit
      : secPerUnit * (100 / METERS_PER_100YD);
  }
  return displayUnit === "METRIC"
    ? secPerUnit
    : secPerUnit / (METERS_PER_MILE / 1000);
}

export function paceInputLabel(
  discipline: "RUN" | "SWIM",
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (discipline === "SWIM") {
    return displayUnit === "METRIC" ? "CSS (min/100m)" : "CSS (min/100yd)";
  }
  return displayUnit === "METRIC" ? "pace (min/km)" : "pace (min/mile)";
}

function formatMinSec(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function parsePaceInput(input: string): number | null {
  const match = input.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  const secs = parseInt(match[2], 10);
  if (secs >= 60) return null;
  return parseInt(match[1], 10) * 60 + secs;
}

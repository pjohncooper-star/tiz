/** ECO-tagged Workout Signaling trigger patterns. */
export function isEcoTriggerPattern(triggerPattern: string): boolean {
  return triggerPattern.includes("_ECO_");
}

export function ecoOverextendedTriggerPattern(
  discipline: string,
  lookbackHours: number
): string {
  return `${discipline}_ECO_overextended_prev1-3_${lookbackHours}h`;
}

export function ecoLightTriggerPattern(discipline: string, lookbackHours: number): string {
  return `${discipline}_ECO_light_prev1-3_${lookbackHours}h`;
}

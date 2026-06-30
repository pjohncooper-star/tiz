import type { PlanDiscipline } from "@/lib/plan/session";

/** Build TiZ budget zone keys from zone pills and optional session duration. */
export function buildSessionTargetZones(
  zones: Partial<Record<number, number>>,
  durationMinutes: number | null
): Record<string, number> {
  const zoneEntries = Object.entries(zones) as Array<[string, number]>;
  const zoneTotal = zoneEntries.reduce((sum, [, m]) => sum + m, 0);
  const sessionDuration = durationMinutes ?? (zoneTotal > 0 ? zoneTotal : null);

  const targetZones: Record<string, number> = {};
  for (const [zone, minutes] of zoneEntries) {
    if (minutes > 0) targetZones[zone] = Math.round(minutes);
  }

  if (sessionDuration != null && sessionDuration > zoneTotal) {
    const remainder = Math.round(sessionDuration - zoneTotal);
    if (remainder > 0) {
      targetZones["1"] = (targetZones["1"] ?? 0) + remainder;
    }
  } else if (Object.keys(targetZones).length === 0 && sessionDuration != null && sessionDuration > 0) {
    targetZones["1"] = Math.round(sessionDuration);
  }

  return targetZones;
}

export function hasTargetZones(targetZones: Record<string, number> | null | undefined): boolean {
  if (!targetZones) return false;
  return Object.values(targetZones).some((m) => m > 0);
}

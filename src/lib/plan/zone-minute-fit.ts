const ZONES = [1, 2, 3, 4, 5] as const;

export type ZoneNumber = (typeof ZONES)[number];
export type ZoneMinuteValues = Record<ZoneNumber, string>;

export function emptyZoneMinuteValues(): ZoneMinuteValues {
  return { 1: "", 2: "", 3: "", 4: "", 5: "" };
}

export function zoneMinuteValuesFromRecord(
  zones: Partial<Record<number, number>>
): ZoneMinuteValues {
  const values = emptyZoneMinuteValues();
  for (const zone of ZONES) {
    const minutes = zones[zone];
    if (minutes != null && minutes > 0) values[zone] = String(Math.round(minutes));
  }
  return values;
}

export function parseZoneMinuteValues(
  values: ZoneMinuteValues
): Partial<Record<ZoneNumber, number>> {
  const out: Partial<Record<ZoneNumber, number>> = {};
  for (const zone of ZONES) {
    const raw = values[zone].trim();
    if (!raw) continue;
    const minutes = Number(raw);
    if (Number.isFinite(minutes) && minutes > 0) out[zone] = Math.round(minutes);
  }
  return out;
}

export function totalZoneMinuteInputValues(values: ZoneMinuteValues): number {
  return Object.values(parseZoneMinuteValues(values)).reduce((sum, m) => sum + m, 0);
}

/** Scale zone pills down proportionally when total exceeds session duration. */
export function fitZoneMinuteValuesToDuration(
  values: ZoneMinuteValues,
  durationMinutes: number | null
): ZoneMinuteValues {
  if (durationMinutes == null || durationMinutes <= 0) return values;

  const parsed = parseZoneMinuteValues(values);
  const target = Math.round(durationMinutes);
  const zoneSum = Object.values(parsed).reduce((sum, minutes) => sum + minutes, 0);
  if (zoneSum <= 0 || zoneSum <= target) return values;

  const scaled: Partial<Record<ZoneNumber, number>> = {};
  const floors: Array<{ zone: ZoneNumber; floored: number; remainder: number }> = [];
  let allocated = 0;

  for (const zone of ZONES) {
    const minutes = parsed[zone];
    if (minutes == null || minutes <= 0) continue;
    const exact = (minutes / zoneSum) * target;
    const floored = Math.floor(exact);
    scaled[zone] = floored;
    allocated += floored;
    floors.push({ zone, floored, remainder: exact - floored });
  }

  let remaining = target - allocated;
  floors.sort((a, b) => b.remainder - a.remainder);
  for (const item of floors) {
    if (remaining <= 0) break;
    scaled[item.zone] = (scaled[item.zone] ?? 0) + 1;
    remaining--;
  }

  return zoneMinuteValuesFromRecord(scaled);
}

export function fitZoneRecordToDuration(
  zones: Partial<Record<number, number>>,
  durationMinutes: number | null
): Partial<Record<number, number>> {
  return parseZoneMinuteValues(
    fitZoneMinuteValuesToDuration(zoneMinuteValuesFromRecord(zones), durationMinutes)
  );
}

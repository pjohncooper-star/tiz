import type { Discipline } from "@prisma/client";
import { zoneKey, type ZoneMinutes } from "@/lib/workout/steps";

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

export function zoneMinuteValuesFromSingle(zone: number, minutes: number): ZoneMinuteValues {
  const values = emptyZoneMinuteValues();
  if (minutes > 0 && zone >= 1 && zone <= 5) {
    values[zone as ZoneNumber] = String(Math.round(minutes));
  }
  return values;
}

export function parseZoneMinuteValues(values: ZoneMinuteValues): Partial<Record<ZoneNumber, number>> {
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

export function zoneMinuteValuesFromDisciplineZones(
  zones: ZoneMinutes,
  discipline: Discipline
): ZoneMinuteValues {
  const values = emptyZoneMinuteValues();
  for (const zone of ZONES) {
    const minutes = zones[zoneKey(discipline, zone)];
    if (minutes != null && minutes > 0) {
      values[zone] = String(Math.round(minutes));
    }
  }
  return values;
}

export function disciplineZoneMinutesFromPills(
  values: ZoneMinuteValues,
  discipline: Discipline
): ZoneMinutes {
  const parsed = parseZoneMinuteValues(values);
  const out: ZoneMinutes = {};
  for (const [zone, minutes] of Object.entries(parsed)) {
    if (minutes > 0) {
      out[zoneKey(discipline, Number(zone))] = minutes;
    }
  }
  return out;
}

type ZoneMinutePillsProps = {
  values: ZoneMinuteValues;
  onChange: (zone: ZoneNumber, value: string) => void;
  compact?: boolean;
  className?: string;
  /** When set, zone minutes cannot exceed this total (e.g. session duration). */
  maxTotalMinutes?: number | null;
};

const DEFAULT_LABEL = "mb-1 block text-center text-xs font-medium text-zinc-500";
const COMPACT_LABEL = "mb-0.5 block text-center text-[10px] font-medium leading-none text-zinc-500";

const DEFAULT_INPUT =
  "w-[3ch] min-w-[2.25rem] rounded border border-zinc-300 bg-white px-0.5 py-1 text-center text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const COMPACT_INPUT =
  "w-[3ch] min-w-[2rem] rounded border border-zinc-300 bg-white px-0.5 py-0.5 text-center text-xs tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export function ZoneMinutePills({
  values,
  onChange,
  compact = false,
  className = "",
  maxTotalMinutes = null,
}: ZoneMinutePillsProps) {
  const labelClass = compact ? COMPACT_LABEL : DEFAULT_LABEL;
  const inputClass = compact ? COMPACT_INPUT : DEFAULT_INPUT;
  const zoneTotal = totalZoneMinuteInputValues(values);
  const displayCap =
    maxTotalMinutes != null && maxTotalMinutes > 0
      ? Math.ceil(maxTotalMinutes)
      : null;
  const capped =
    displayCap != null && displayCap > 0 && zoneTotal > displayCap;

  function handleChange(zone: ZoneNumber, raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, 3);
    if (displayCap == null || displayCap <= 0 || !next) {
      onChange(zone, next);
      return;
    }
    const requested = Number(next);
    if (!Number.isFinite(requested) || requested <= 0) {
      onChange(zone, next);
      return;
    }
    const otherTotal = zoneTotal - (parseZoneMinuteValues(values)[zone] ?? 0);
    const allowed = Math.max(0, displayCap - otherTotal);
    onChange(zone, String(Math.min(requested, allowed)));
  }

  return (
    <div className={className}>
      <div className={`flex justify-between gap-0.5`}>
        {ZONES.map((zone) => (
          <div key={zone} className="flex min-w-0 flex-1 flex-col items-center">
            <span className={labelClass}>Z{zone}</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={3}
              className={inputClass}
              value={values[zone]}
              onChange={(e) => handleChange(zone, e.target.value)}
              placeholder="—"
              aria-label={`Zone ${zone} minutes`}
            />
          </div>
        ))}
      </div>
      {capped ? (
        <p className={`mt-0.5 text-red-600 ${compact ? "text-[10px]" : "text-xs"}`}>
          Zone minutes cannot exceed duration ({displayCap} min).
        </p>
      ) : displayCap != null && displayCap > 0 ? (
        <p className={`mt-0.5 text-zinc-500 ${compact ? "text-[10px]" : "text-xs"}`}>
          {zoneTotal > 0
            ? `${zoneTotal} / ${displayCap} min zoned`
            : `Up to ${displayCap} min`}
        </p>
      ) : null}
    </div>
  );
}

import type { Discipline, SignalType, ThresholdProfile } from "@prisma/client";
import { formatPace, thresholdPaceToInput } from "@/lib/units/pace";
import { roundPct, speedPctToPacePct } from "@/lib/zones/boundaries";
import { parseZoneBoundaries } from "./thresholds";

export type ZoneRange = {
  zone: number;
  /** Stored intensity % (speed % for pace). */
  minPct: number | null;
  maxPct: number | null;
};

export function zonePctRanges(
  signalType: SignalType,
  boundaries: number[],
  zoneCount: number
): ZoneRange[] {
  const zones: ZoneRange[] = [];

  if (signalType === "PACE") {
    const sorted = [...boundaries].sort((a, b) => a - b);
    for (let z = 1; z <= zoneCount; z++) {
      if (z === 1) {
        zones.push({ zone: z, minPct: null, maxPct: sorted[0] });
      } else if (z === zoneCount) {
        zones.push({ zone: z, minPct: sorted[z - 2], maxPct: null });
      } else {
        zones.push({
          zone: z,
          minPct: sorted[z - 2],
          maxPct: sorted[z - 1],
        });
      }
    }
    return zones;
  }

  for (let z = 1; z <= zoneCount; z++) {
    if (z === 1) {
      zones.push({ zone: z, minPct: null, maxPct: boundaries[0] });
    } else if (z === zoneCount) {
      zones.push({ zone: z, minPct: boundaries[z - 2], maxPct: null });
    } else {
      zones.push({
        zone: z,
        minPct: boundaries[z - 2],
        maxPct: boundaries[z - 1],
      });
    }
  }
  return zones;
}

function formatPctRange(
  signalType: SignalType,
  minPct: number | null,
  maxPct: number | null
): string {
  if (signalType === "PACE") {
    // Display as % of threshold pace (higher = slower).
    // minPct/maxPct are stored speed % (higher = faster).
    const slowPacePct =
      minPct != null ? roundPct(speedPctToPacePct(minPct)) : null;
    const fastPacePct =
      maxPct != null ? roundPct(speedPctToPacePct(maxPct)) : null;
    if (slowPacePct == null && fastPacePct != null) return `> ${fastPacePct}%`;
    if (slowPacePct != null && fastPacePct == null) return `< ${slowPacePct}%`;
    if (slowPacePct != null && fastPacePct != null) {
      return `${fastPacePct}–${slowPacePct}%`;
    }
    return "";
  }

  if (minPct == null && maxPct != null) return `< ${maxPct}%`;
  if (minPct != null && maxPct == null) return `≥ ${minPct}%`;
  if (minPct != null && maxPct != null) return `${minPct}–${maxPct}%`;
  return "";
}

function formatAbsoluteRange(
  range: ZoneRange,
  profile: ThresholdProfile,
  discipline: Discipline,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  const { signalType, thresholdValue } = profile;
  const { minPct, maxPct } = range;

  if (signalType === "POWER") {
    if (minPct == null && maxPct != null) {
      return `≤ ${Math.round((thresholdValue * maxPct) / 100)} W`;
    }
    if (minPct != null && maxPct == null) {
      return `> ${Math.round((thresholdValue * minPct) / 100)} W`;
    }
    if (minPct != null && maxPct != null) {
      return `${Math.round((thresholdValue * minPct) / 100)}–${Math.round((thresholdValue * maxPct) / 100)} W`;
    }
  }

  if (signalType === "HEART_RATE") {
    if (minPct == null && maxPct != null) {
      return `≤ ${Math.round((thresholdValue * maxPct) / 100)} bpm`;
    }
    if (minPct != null && maxPct == null) {
      return `> ${Math.round((thresholdValue * minPct) / 100)} bpm`;
    }
    if (minPct != null && maxPct != null) {
      return `${Math.round((thresholdValue * minPct) / 100)}–${Math.round((thresholdValue * maxPct) / 100)} bpm`;
    }
  }

  if (signalType === "PACE") {
    const unit =
      discipline === "SWIM"
        ? displayUnit === "METRIC"
          ? "100m"
          : "100yd"
        : displayUnit === "METRIC"
          ? "km"
          : "mi";

    if (minPct == null && maxPct != null) {
      const slow = (thresholdValue * 100) / maxPct;
      return `slower than ${formatPace(slow, unit)}/${unit}`;
    }
    if (minPct != null && maxPct == null) {
      const fast = (thresholdValue * 100) / minPct;
      return `faster than ${formatPace(fast, unit)}/${unit}`;
    }
    if (minPct != null && maxPct != null) {
      const fast = (thresholdValue * 100) / maxPct;
      const slow = (thresholdValue * 100) / minPct;
      return `${formatPace(fast, unit)}–${formatPace(slow, unit)}/${unit}`;
    }
  }

  return "";
}

export function formatZoneRangeLabel(
  range: ZoneRange,
  profile: ThresholdProfile,
  discipline: Discipline,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  const pct = formatPctRange(profile.signalType, range.minPct, range.maxPct);
  const abs = formatAbsoluteRange(range, profile, discipline, displayUnit);
  return abs ? `${pct} · ${abs}` : pct;
}

export function formatThresholdLabel(
  profile: ThresholdProfile,
  discipline: Discipline,
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  if (profile.signalType === "POWER") {
    return `${Math.round(profile.thresholdValue)} W FTP`;
  }
  if (profile.signalType === "HEART_RATE") {
    return `${Math.round(profile.thresholdValue)} bpm LTHR`;
  }
  if (discipline === "SWIM" || discipline === "RUN") {
    const d = discipline as "SWIM" | "RUN";
    const unit =
      d === "SWIM"
        ? displayUnit === "METRIC"
          ? "/100m"
          : "/100yd"
        : displayUnit === "METRIC"
          ? "/km"
          : "/mi";
    return `${thresholdPaceToInput(profile.thresholdValue, d, displayUnit)}${unit}`;
  }
  return String(profile.thresholdValue);
}

export function signalLabel(signal: SignalType): string {
  if (signal === "POWER") return "Power";
  if (signal === "HEART_RATE") return "Heart rate";
  return "Pace";
}

export function zoneRangesForProfile(
  profile: ThresholdProfile,
  discipline: Discipline,
  displayUnit: "METRIC" | "IMPERIAL"
): Array<{ zone: number; label: string }> {
  const boundaries = parseZoneBoundaries(profile.zoneBoundaries);
  return zonePctRanges(profile.signalType, boundaries, profile.zoneCount).map(
    (range) => ({
      zone: range.zone,
      label: formatZoneRangeLabel(range, profile, discipline, displayUnit),
    })
  );
}

export function zonePercentages(
  rows: Array<{ zone: number; minutes: number }>
): Map<number, number> {
  const total = rows.reduce((sum, row) => sum + row.minutes, 0);
  const pct = new Map<number, number>();
  if (total <= 0) return pct;
  for (const row of rows) {
    pct.set(row.zone, (row.minutes / total) * 100);
  }
  return pct;
}

import { normalizeZoneSplitPercents } from "./phase-zone-defaults";
import type { ZoneSplitPercents } from "./zone-split-types";

/** Cumulative boundaries between zones: 0 < b1 < b2 < b3 < b4 < 100 */
export type ZoneBoundaries = [number, number, number, number];

const DEFAULT_MIN_ZONE_PERCENT = 1;

export function percentsFromBoundaries(boundaries: ZoneBoundaries): ZoneSplitPercents {
  const [b1, b2, b3, b4] = boundaries;
  return normalizeZoneSplitPercents({
    z1: b1,
    z2: b2 - b1,
    z3: b3 - b2,
    z4: b4 - b3,
    z5: 100 - b4,
  });
}

export function boundariesFromPercents(percents: ZoneSplitPercents): ZoneBoundaries {
  const normalized = normalizeZoneSplitPercents(percents);
  const b1 = normalized.z1;
  const b2 = b1 + normalized.z2;
  const b3 = b2 + normalized.z3;
  const b4 = b3 + normalized.z4;
  return [b1, b2, b3, b4];
}

function minBoundaryForHandle(
  handleIndex: number,
  boundaries: ZoneBoundaries,
  minZonePercent: number
): number {
  return boundaries[handleIndex - 1]! + minZonePercent;
}

function maxBoundaryForHandle(handleIndex: number, minZonePercent: number): number {
  const zonesAfter = 4 - handleIndex;
  return 100 - zonesAfter * minZonePercent;
}

export function clampBoundaryDrag(
  handleIndex: number,
  newValue: number,
  boundaries: ZoneBoundaries,
  minZonePercent = DEFAULT_MIN_ZONE_PERCENT
): ZoneBoundaries {
  const next = [...boundaries] as ZoneBoundaries;
  const min =
    handleIndex === 0 ? minZonePercent : minBoundaryForHandle(handleIndex, boundaries, minZonePercent);
  const max = maxBoundaryForHandle(handleIndex, minZonePercent);
  next[handleIndex] = Math.max(min, Math.min(max, newValue));

  for (let index = handleIndex + 1; index < 4; index++) {
    const floor = next[index - 1]! + minZonePercent;
    const ceiling = maxBoundaryForHandle(index, minZonePercent);
    next[index] = Math.max(floor, Math.min(ceiling, next[index]!));
  }

  for (let index = handleIndex - 1; index >= 0; index--) {
    const floor = index === 0 ? minZonePercent : next[index - 1]! + minZonePercent;
    next[index] = Math.max(floor, Math.min(next[index + 1]! - minZonePercent, next[index]!));
  }

  return next;
}

export function boundaryFromPointerRatio(
  ratio: number,
  handleIndex: number,
  boundaries: ZoneBoundaries,
  minZonePercent = DEFAULT_MIN_ZONE_PERCENT
): ZoneBoundaries {
  const value = Math.max(0, Math.min(1, ratio)) * 100;
  return clampBoundaryDrag(handleIndex, value, boundaries, minZonePercent);
}

export function zonePercentsArray(percents: ZoneSplitPercents): number[] {
  const normalized = normalizeZoneSplitPercents(percents);
  return [normalized.z1, normalized.z2, normalized.z3, normalized.z4, normalized.z5];
}

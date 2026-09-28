export type LatLng = [number, number];

export type ChartCursor = {
  timeSec: number;
  distanceM: number;
};

export type ChartSelection = {
  startTimeSec: number;
  endTimeSec: number;
  startDistanceM: number;
  endDistanceM: number;
};

export type RouteXMode = "time" | "distance";

/** GeoJSON MultiLineString coordinates: arrays of [lng, lat]. */
export type RouteLines = number[][][];

const SEMICIRCLES_TO_DEGREES = 180 / 2147483648;
export const MIN_ROUTE_POINTS = 10;
const MIN_SPAN_DEG = 0.0002;

export type RouteSample = {
  timeSec: number;
  distanceM: number;
  lat: number | null;
  lng: number | null;
};

export function normalizeLatLng(lat: unknown, lng: unknown): LatLng | null {
  if (typeof lat !== "number" && typeof lat !== "string") return null;
  if (typeof lng !== "number" && typeof lng !== "string") return null;
  const latN = typeof lat === "number" ? lat : Number(lat);
  const lngN = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
  if (latN === 0 && lngN === 0) return null;
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return null;
  return [latN, lngN];
}

/** FIT SDK leaves positionLat/positionLong as sint32 semicircles (scale 1). */
export function fitCoordinateToDegrees(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (Math.abs(value) <= 180) return value;
  return value * SEMICIRCLES_TO_DEGREES;
}

export function latLngFromFitRecord(
  record: Record<string, unknown>
): LatLng | null {
  const rawLat = record.positionLat ?? record.position_lat;
  const rawLng = record.positionLong ?? record.position_long;
  return normalizeLatLng(
    fitCoordinateToDegrees(rawLat),
    fitCoordinateToDegrees(rawLng)
  );
}

export function parseLatLngSample(sample: unknown): LatLng | null {
  if (sample == null) return null;
  if (Array.isArray(sample) && sample.length >= 2) {
    return normalizeLatLng(sample[0], sample[1]);
  }
  if (typeof sample === "object") {
    const o = sample as Record<string, unknown>;
    return normalizeLatLng(
      o.lat ?? o.latitude,
      o.lng ?? o.lon ?? o.longitude
    );
  }
  return null;
}

export function parseLatLngSeries(
  data: unknown
): Array<LatLng | null> | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const mapped = data.map(parseLatLngSample);
  return mapped.some((p) => p != null) ? mapped : null;
}

export function hasActivityRoute(points: RouteSample[]): boolean {
  const valid = points.filter(
    (p): p is RouteSample & { lat: number; lng: number } =>
      p.lat != null && p.lng != null
  );
  if (valid.length < MIN_ROUTE_POINTS) return false;
  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;
  let minLng = valid[0].lng;
  let maxLng = valid[0].lng;
  for (const p of valid) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return maxLat - minLat > MIN_SPAN_DEG || maxLng - minLng > MIN_SPAN_DEG;
}

export function routeFromPoints(points: RouteSample[]): RouteLines {
  const lines: RouteLines = [];
  let current: number[][] = [];
  for (const p of points) {
    if (p.lat == null || p.lng == null) {
      if (current.length >= 2) lines.push(current);
      current = [];
      continue;
    }
    current.push([p.lng, p.lat]);
  }
  if (current.length >= 2) lines.push(current);
  return lines;
}

function sampleX(point: RouteSample, mode: RouteXMode): number {
  return mode === "time" ? point.timeSec : point.distanceM;
}

export function pointAtCursor(
  points: RouteSample[],
  cursor: ChartCursor,
  mode: RouteXMode = "time"
): { lat: number; lng: number } | null {
  const target = mode === "time" ? cursor.timeSec : cursor.distanceM;
  let best: { lat: number; lng: number } | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    if (p.lat == null || p.lng == null) continue;
    const d = Math.abs(sampleX(p, mode) - target);
    if (d < bestDist) {
      bestDist = d;
      best = { lat: p.lat, lng: p.lng };
    }
  }
  return best;
}

export function sliceRoute(
  points: RouteSample[],
  selection: ChartSelection,
  mode: RouteXMode = "time"
): RouteLines {
  const start =
    mode === "time" ? selection.startTimeSec : selection.startDistanceM;
  const end = mode === "time" ? selection.endTimeSec : selection.endDistanceM;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  return routeFromPoints(
    points.filter((p) => {
      const x = sampleX(p, mode);
      return x >= lo && x <= hi;
    })
  );
}

export function routeBounds(
  lines: RouteLines
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let any = false;
  for (const line of lines) {
    for (const coord of line) {
      const lng = coord[0];
      const lat = coord[1];
      if (lng == null || lat == null) continue;
      any = true;
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!any) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function firstLastCoordinates(points: RouteSample[]): {
  start: { lat: number; lng: number } | null;
  finish: { lat: number; lng: number } | null;
} {
  let start: { lat: number; lng: number } | null = null;
  let finish: { lat: number; lng: number } | null = null;
  for (const p of points) {
    if (p.lat == null || p.lng == null) continue;
    if (!start) start = { lat: p.lat, lng: p.lng };
    finish = { lat: p.lat, lng: p.lng };
  }
  return { start, finish };
}

export function mapboxAccessToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  return token && token.trim() ? token.trim() : null;
}

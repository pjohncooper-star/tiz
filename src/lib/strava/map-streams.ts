import { parseLatLngSeries } from "@/lib/activity/latlng";
import type { NormalizedStreams } from "@/lib/zones/compute";

export const STRAVA_STREAM_KEYS =
  "time,watts,heartrate,velocity_smooth,cadence,distance,latlng";

function applyStravaStream(
  streams: NormalizedStreams,
  type: string,
  data: unknown
) {
  if (!Array.isArray(data)) return;
  if (type === "time") streams.time = { data: data as number[] };
  if (type === "watts") streams.watts = { data: data as number[] };
  if (type === "heartrate") streams.heartrate = { data: data as number[] };
  if (type === "velocity_smooth") streams.velocity = { data: data as number[] };
  if (type === "cadence") streams.cadence = { data: data as number[] };
  if (type === "distance") streams.distance = { data: data as number[] };
  if (type === "latlng") {
    const latlng = parseLatLngSeries(data);
    if (latlng) streams.latlng = { data: latlng };
  }
}

export function mapStravaStreams(raw: unknown): NormalizedStreams {
  const streams: NormalizedStreams = {};
  if (Array.isArray(raw)) {
    for (const s of raw) {
      if (!s || typeof s !== "object") continue;
      const row = s as { type?: unknown; data?: unknown };
      if (typeof row.type === "string") {
        applyStravaStream(streams, row.type, row.data);
      }
    }
    return streams;
  }
  if (raw && typeof raw === "object") {
    for (const [type, series] of Object.entries(
      raw as Record<string, { data?: unknown } | undefined>
    )) {
      applyStravaStream(streams, type, series?.data);
    }
  }
  return streams;
}

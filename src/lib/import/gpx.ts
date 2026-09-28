import type { ParsedActivity } from "./types";
import { emptyStreams } from "./types";
import { buildGpxActivityName } from "./names";
import { normalizeLatLng } from "@/lib/activity/latlng";

export function parseGpxFile(xml: string, fallbackName: string): ParsedActivity | null {
  const trkType = xml.match(/<type>([^<]+)<\/type>/i)?.[1]?.toLowerCase() ?? "";
  let discipline: ParsedActivity["discipline"] = "RUN";
  if (trkType.includes("bike") || trkType.includes("cycl")) discipline = "BIKE";
  if (trkType.includes("swim")) discipline = "SWIM";

  const points = [...xml.matchAll(/<trkpt[\s\S]*?<\/trkpt>/gi)];
  if (points.length < 2) return null;

  const times: string[] = [];
  const elapsed: number[] = [];
  const latlng: Array<[number, number] | null> = [];
  let t0: Date | null = null;

  for (const match of points) {
    const block = match[0];
    const open = block.match(/<trkpt\b[^>]*>/i)?.[0] ?? "";
    const lat = open.match(/\blat=["']([^"']+)["']/i)?.[1];
    const lon = open.match(/\blon=["']([^"']+)["']/i)?.[1];
    latlng.push(
      normalizeLatLng(lat != null ? Number(lat) : NaN, lon != null ? Number(lon) : NaN)
    );

    const timeStr = block.match(/<time>([^<]+)<\/time>/i)?.[1];
    if (timeStr) {
      times.push(timeStr);
      const t = new Date(timeStr);
      if (!t0) t0 = t;
      elapsed.push((t.getTime() - t0.getTime()) / 1000);
    }
  }

  const startTime = times[0] ? new Date(times[0]) : new Date();
  const endTime = times[times.length - 1] ? new Date(times[times.length - 1]) : startTime;
  const durationSeconds = Math.max(
    1,
    Math.round((endTime.getTime() - startTime.getTime()) / 1000)
  );

  const streams = emptyStreams();
  if (elapsed.length === latlng.length && elapsed.length > 0) {
    streams.time = { data: elapsed };
  }
  if (latlng.some((p) => p != null)) streams.latlng = { data: latlng };

  return {
    name: buildGpxActivityName(xml, fallbackName),
    discipline,
    startTime,
    durationSeconds,
    streams,
  };
}

import type { ParsedActivity } from "./types";
import { emptyStreams } from "./types";
import { buildGpxActivityName } from "./names";

export function parseGpxFile(xml: string, fallbackName: string): ParsedActivity | null {
  const trkType = xml.match(/<type>([^<]+)<\/type>/i)?.[1]?.toLowerCase() ?? "";
  let discipline: ParsedActivity["discipline"] = "RUN";
  if (trkType.includes("bike") || trkType.includes("cycl")) discipline = "BIKE";
  if (trkType.includes("swim")) discipline = "SWIM";

  const points = [...xml.matchAll(/<trkpt[\s\S]*?<\/trkpt>/gi)];
  if (points.length < 2) return null;

  const times = points
    .map((p) => p[0].match(/<time>([^<]+)<\/time>/i)?.[1])
    .filter(Boolean) as string[];

  const startTime = times[0] ? new Date(times[0]) : new Date();
  const endTime = times[times.length - 1] ? new Date(times[times.length - 1]) : startTime;
  const durationSeconds = Math.max(
    1,
    Math.round((endTime.getTime() - startTime.getTime()) / 1000)
  );

  return {
    name: buildGpxActivityName(xml, fallbackName),
    discipline,
    startTime,
    durationSeconds,
    streams: emptyStreams(),
  };
}

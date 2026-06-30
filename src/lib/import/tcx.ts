import type { ParsedActivity } from "./types";
import { emptyStreams } from "./types";
import { buildTcxActivityName } from "./names";
import {
  deriveVelocityFromDistance,
  looksLikeCumulativeDistance,
} from "@/lib/zones/sample-time";

function mapSport(sport: string): ParsedActivity["discipline"] | null {
  const s = sport.toLowerCase();
  if (s.includes("bik") || s.includes("cycl")) return "BIKE";
  if (s.includes("run")) return "RUN";
  if (s.includes("swim")) return "SWIM";
  return null;
}

export function parseTcxFile(xml: string, fallbackName: string): ParsedActivity | null {
  const sportMatch = xml.match(/<Activity\s+Sport="([^"]+)"/i);
  const discipline = mapSport(sportMatch?.[1] ?? "");
  if (!discipline) return null;

  const startMatch = xml.match(/<Id>([^<]+)<\/Id>/i);
  const startTime = startMatch ? new Date(startMatch[1]) : new Date();
  if (Number.isNaN(startTime.getTime())) return null;

  const trackpoints = [...xml.matchAll(/<Trackpoint>[\s\S]*?<\/Trackpoint>/gi)];
  const hr: number[] = [];
  const watts: number[] = [];
  const distances: number[] = [];
  const elapsed: number[] = [];
  const speeds: number[] = [];

  for (const tp of trackpoints) {
    const block = tp[0];
    const timeM = block.match(/<Time>([^<]+)<\/Time>/i);
    const hrM = block.match(/<HeartRateBpm>[\s\S]*?<Value>(\d+)<\/Value>/i);
    const wM = block.match(/<Watts>(\d+)<\/Watts>/i);
    const distM = block.match(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/i);
    const speedM = block.match(/<Speed>([\d.]+)<\/Speed>/i);

    if (timeM) {
      const t = new Date(timeM[1]);
      elapsed.push((t.getTime() - startTime.getTime()) / 1000);
    }
    if (hrM) hr.push(parseInt(hrM[1], 10));
    if (wM) watts.push(parseInt(wM[1], 10));
    if (distM) distances.push(parseFloat(distM[1]));
    if (speedM) speeds.push(parseFloat(speedM[1]));
  }

  const totalTimeM = xml.match(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/i);
  const distM = xml.match(/<DistanceMeters>([\d.]+)<\/DistanceMeters>/i);

  const streams = emptyStreams();
  if (elapsed.length) streams.time = { data: elapsed };
  if (hr.length) streams.heartrate = { data: hr };
  if (watts.length) streams.watts = { data: watts };

  if (speeds.some((v) => v > 0) && !looksLikeCumulativeDistance(speeds)) {
    streams.velocity = { data: speeds };
  } else if (distances.length >= 2 && elapsed.length >= 2) {
    const vel = deriveVelocityFromDistance(distances, elapsed);
    if (vel.some((v) => v > 0)) streams.velocity = { data: vel };
  }
  if (distances.some((d) => d > 0)) streams.distance = { data: distances };

  return {
    name: buildTcxActivityName(xml, fallbackName),
    discipline,
    startTime,
    durationSeconds: Math.round(parseFloat(totalTimeM?.[1] ?? "0")),
    distanceMeters: distM ? parseFloat(distM[1]) : undefined,
    streams,
  };
}

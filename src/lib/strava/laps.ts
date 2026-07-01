import type { SwimLapPoint } from "@/lib/import/swim-laps";
import { stravaFetch } from "./client";

export type StravaLap = {
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_speed?: number;
  start_date?: string;
  lap_index?: number;
};

export async function fetchStravaActivityLaps(
  activityId: number,
  token: string
): Promise<StravaLap[]> {
  return stravaFetch<StravaLap[]>(`/activities/${activityId}/laps`, token);
}

/** Map Strava activity laps to TiZ swim lap timeline for pace zone calculation. */
export function mapStravaLapsToSwimLaps(
  laps: StravaLap[],
  activityStart: Date
): SwimLapPoint[] | null {
  if (!laps.length) return null;

  const sorted = [...laps].sort(
    (a, b) => (a.lap_index ?? 0) - (b.lap_index ?? 0)
  );
  const sessionStartMs = activityStart.getTime();
  const data: SwimLapPoint[] = [];
  let cumulativeSec = 0;

  for (const lap of sorted) {
    const duration =
      lap.moving_time > 0 ? lap.moving_time : lap.elapsed_time;
    if (duration <= 0) continue;

    let startSec: number;
    if (lap.start_date) {
      startSec = Math.max(
        (new Date(lap.start_date).getTime() - sessionStartMs) / 1000,
        0
      );
    } else {
      startSec = cumulativeSec;
    }

    let speed = lap.average_speed ?? 0;
    if (speed <= 0 && lap.distance > 0 && duration > 0) {
      speed = lap.distance / duration;
    }

    const isRest = lap.distance <= 0 || speed <= 0;
    data.push({
      startSec,
      durationSec: duration,
      speedMps: isRest ? 0 : speed,
    });

    cumulativeSec = startSec + duration;
  }

  return data.length > 0 ? data : null;
}

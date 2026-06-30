import type { NormalizedStreams } from "@/lib/zones/compute";
import { isPoolSwimSession } from "./swim-lengths";

export type SwimLapPoint = {
  startSec: number;
  durationSec: number;
  speedMps: number;
};

function lapStartTime(lap: Record<string, unknown>): Date | null {
  const t = lap.startTime ?? lap.timestamp;
  return t instanceof Date ? t : null;
}

function lapDurationSec(lap: Record<string, unknown>): number {
  return (
    (lap.totalTimerTime as number) ??
    (lap.totalElapsedTime as number) ??
    0
  );
}

function lapSpeed(lap: Record<string, unknown>): number {
  const speed =
    (lap.enhancedAvgSpeed as number) ??
    (lap.avgSpeed as number) ??
    0;
  return typeof speed === "number" && speed > 0 ? speed : 0;
}

function isRestLap(lap: Record<string, unknown>): boolean {
  const distance = (lap.totalDistance as number) ?? 0;
  return distance <= 0 || lapSpeed(lap) <= 0;
}

export function lapsForSession(
  lapMesgs: Array<Record<string, unknown>>,
  sessionStart: Date,
  sessionEnd: Date
): Array<Record<string, unknown>> {
  return lapMesgs
    .filter((lap) => {
      const t = lapStartTime(lap);
      return t && t >= sessionStart && t <= sessionEnd;
    })
    .sort(
      (a, b) =>
        lapStartTime(a)!.getTime() - lapStartTime(b)!.getTime()
    );
}

/** Build per-lap pace timeline from Garmin pool swim lap messages. */
export function buildPoolSwimLaps(
  laps: Array<Record<string, unknown>>,
  sessionStart: Date
): SwimLapPoint[] | null {
  if (laps.length === 0) return null;

  const data: SwimLapPoint[] = [];
  const sessionStartMs = sessionStart.getTime();

  for (const lap of laps) {
    const start = lapStartTime(lap);
    const duration = lapDurationSec(lap);
    if (!start || duration <= 0) continue;

    const startSec = Math.max((start.getTime() - sessionStartMs) / 1000, 0);
    const speed = isRestLap(lap) ? 0 : lapSpeed(lap);
    data.push({ startSec, durationSec: duration, speedMps: speed });
  }

  return data.length > 0 ? data : null;
}

/** Active swim laps as velocity + velocityTime for pace zone calculation. */
export function buildPoolSwimLapPaceStreams(
  laps: SwimLapPoint[]
): Pick<NormalizedStreams, "velocity" | "velocityTime"> | null {
  const velocity: number[] = [];
  const velocityTime: number[] = [];
  let cumulativeSec = 0;

  for (const lap of laps) {
    if (lap.durationSec <= 0 || lap.speedMps <= 0) continue;
    cumulativeSec += lap.durationSec;
    velocity.push(lap.speedMps);
    velocityTime.push(cumulativeSec);
  }

  if (velocity.length === 0) return null;

  return {
    velocity: { data: velocity },
    velocityTime: { data: velocityTime },
  };
}

export function mergePoolSwimLapData(
  base: NormalizedStreams,
  lapMesgs: Array<Record<string, unknown>> | undefined,
  session: Record<string, unknown>,
  sessionStart: Date,
  sessionEnd: Date
): NormalizedStreams {
  if (!lapMesgs?.length || !isPoolSwimSession(session)) return base;

  const laps = lapsForSession(lapMesgs, sessionStart, sessionEnd);
  const swimLaps = buildPoolSwimLaps(laps, sessionStart);
  if (!swimLaps) return base;

  return {
    ...base,
    swimLaps: { data: swimLaps },
  };
}

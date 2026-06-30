import type { NormalizedStreams } from "@/lib/zones/compute";

function lengthStartTime(length: Record<string, unknown>): Date | null {
  const t = length.startTime ?? length.timestamp;
  return t instanceof Date ? t : null;
}

function lengthDurationSec(length: Record<string, unknown>): number {
  return (
    (length.totalTimerTime as number) ??
    (length.totalElapsedTime as number) ??
    0
  );
}

function lengthSpeed(length: Record<string, unknown>): number {
  const speed =
    (length.enhancedAvgSpeed as number) ??
    (length.avgSpeed as number) ??
    0;
  return typeof speed === "number" && speed > 0 ? speed : 0;
}

function isActiveLength(length: Record<string, unknown>): boolean {
  const type = String(length.lengthType ?? "active").toLowerCase();
  return type === "active";
}

export function isPoolSwimSession(session: Record<string, unknown>): boolean {
  const sport = String(session.sport ?? "").toLowerCase();
  const subSport = String(session.subSport ?? "").toLowerCase();
  if (sport !== "swimming" && sport !== "5") return false;
  return (
    subSport.includes("lap") ||
    subSport.includes("pool") ||
    ((session.poolLength as number) ?? 0) > 0
  );
}

export function lengthsForSession(
  lengthMesgs: Array<Record<string, unknown>>,
  sessionStart: Date,
  sessionEnd: Date
): Array<Record<string, unknown>> {
  return lengthMesgs
    .filter((length) => {
      const t = lengthStartTime(length);
      return t && t >= sessionStart && t <= sessionEnd;
    })
    .sort(
      (a, b) =>
        lengthStartTime(a)!.getTime() - lengthStartTime(b)!.getTime()
    );
}

/** Build per-length pace streams from Garmin pool swim length messages. */
export function buildPoolSwimLengthStreams(
  lengths: Array<Record<string, unknown>>
): Pick<NormalizedStreams, "velocity" | "velocityTime"> | null {
  if (lengths.length === 0) return null;

  const velocity: number[] = [];
  const velocityTime: number[] = [];
  let cumulativeSec = 0;

  for (const length of lengths) {
    const duration = lengthDurationSec(length);
    if (duration <= 0) continue;

    cumulativeSec += duration;
    const speed = isActiveLength(length) ? lengthSpeed(length) : 0;

    velocityTime.push(cumulativeSec);
    velocity.push(speed);
  }

  if (!velocity.some((v) => v > 0)) return null;

  return {
    velocity: { data: velocity },
    velocityTime: { data: velocityTime },
  };
}

export function mergePoolSwimStreams(
  base: NormalizedStreams,
  lengthMesgs: Array<Record<string, unknown>> | undefined,
  session: Record<string, unknown>,
  sessionStart: Date,
  sessionEnd: Date
): NormalizedStreams {
  if (!lengthMesgs?.length || !isPoolSwimSession(session)) return base;

  const lengths = lengthsForSession(lengthMesgs, sessionStart, sessionEnd);
  const pace = buildPoolSwimLengthStreams(lengths);
  if (!pace) return base;

  return {
    ...base,
    velocity: pace.velocity,
    velocityTime: pace.velocityTime,
  };
}

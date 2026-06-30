import { Decoder, Stream } from "@garmin/fitsdk";
import { createHash } from "crypto";
import type { ParsedActivity, ActivityLegType } from "./types";
import { emptyStreams } from "./types";
import { buildFitActivityName } from "./names";
import {
  classifyFitMessages,
  isRecordedSession,
} from "./classify";
import type { NormalizedStreams, WorkoutExecutionLap } from "@/lib/zones/compute";
import {
  deriveVelocityFromDistance,
  looksLikeCumulativeDistance,
} from "@/lib/zones/sample-time";
import { mergePoolSwimLapData } from "./swim-laps";
import { parseFitSessionSelfEval } from "@/lib/survey/fit-self-eval";
import { mergePoolSwimStreams } from "./swim-lengths";

function mapSport(
  sport: unknown,
  subSport?: unknown
): ParsedActivity["discipline"] | null {
  const values = [String(sport ?? ""), String(subSport ?? "")]
    .map((v) => v.toLowerCase())
    .filter(Boolean);

  for (const s of values) {
    if (
      s.includes("cycl") ||
      s.includes("bike") ||
      s === "riding" ||
      s.includes("ebik")
    ) {
      return "BIKE";
    }
    if (
      s.includes("run") ||
      s === "walking" ||
      s === "hiking" ||
      s.includes("treadmill") ||
      s.includes("track")
    ) {
      return "RUN";
    }
    if (s.includes("swim") || s.includes("open water")) {
      return "SWIM";
    }
  }

  // FIT sport enum fallbacks when values are numeric
  const sportNum = String(sport);
  if (sportNum === "1" || sportNum === "11" || sportNum === "17") return "RUN";
  if (sportNum === "2" || sportNum === "21") return "BIKE";
  if (sportNum === "5") return "SWIM";

  return null;
}

function sessionStartTime(session: Record<string, unknown>): Date {
  if (session.startTime instanceof Date) return session.startTime;
  if (session.timestamp instanceof Date) return session.timestamp;
  return new Date();
}

function sessionEndTime(
  session: Record<string, unknown>,
  nextSession: Record<string, unknown> | undefined
): Date {
  if (nextSession) {
    const nextStart = sessionStartTime(nextSession);
    return new Date(nextStart.getTime() - 1);
  }
  const start = sessionStartTime(session);
  const durationSeconds =
    (session.totalElapsedTime as number) ??
    (session.totalTimerTime as number) ??
    0;
  return new Date(start.getTime() + Math.max(durationSeconds, 1) * 1000);
}

function recordsForSession(
  records: Array<Record<string, unknown>>,
  start: Date,
  end: Date
): Array<Record<string, unknown>> {
  return records.filter((r) => {
    const t = r.timestamp;
    return t instanceof Date && t >= start && t <= end;
  });
}

function recordTimestamp(record: Record<string, unknown>): Date | null {
  const t = record.timestamp;
  return t instanceof Date ? t : null;
}

function elapsedSeconds(
  records: Array<Record<string, unknown>>
): number[] {
  const t0 = recordTimestamp(records[0]);
  return records.map((r, i) => {
    const t = recordTimestamp(r);
    if (t && t0) return (t.getTime() - t0.getTime()) / 1000;
    return i;
  });
}

function deriveVelocity(
  records: Array<Record<string, unknown>>,
  elapsed: number[]
): number[] {
  const raw = records.map(
    (r) => (r.speed as number) ?? (r.enhancedSpeed as number) ?? 0
  );
  if (!looksLikeCumulativeDistance(raw)) return raw;

  const fromSpeed = deriveVelocityFromDistance(raw, elapsed);
  const distances = records.map((r) => r.distance as number | undefined);
  if (distances.some((d) => typeof d === "number" && d > 0)) {
    const dist = distances.map((d) => (typeof d === "number" ? d : 0));
    return deriveVelocityFromDistance(dist, elapsed);
  }
  return fromSpeed;
}

function powerFromDeveloperFields(
  record: Record<string, unknown>,
  fieldDescriptions: Array<Record<string, unknown>>
): number {
  const df = record.developerFields as Record<string, unknown> | undefined;
  if (!df) return 0;
  for (const desc of fieldDescriptions) {
    const name = String(desc.fieldName ?? "").toLowerCase();
    if (!/power|watt/.test(name)) continue;
    const key = desc.key;
    const val = df[String(key)] ?? df[key as string];
    if (typeof val === "number" && val > 0) return val;
  }
  return 0;
}

function recordPower(
  record: Record<string, unknown>,
  fieldDescriptions: Array<Record<string, unknown>>
): number {
  const power = record.power as number | undefined;
  if (typeof power === "number" && power > 0) return power;
  return powerFromDeveloperFields(record, fieldDescriptions);
}

function extractWorkoutLaps(
  lapMesgs: Array<Record<string, unknown>> | undefined,
  sessionStart: Date,
  sessionEnd: Date
): WorkoutExecutionLap[] {
  if (!lapMesgs?.length) return [];
  return lapMesgs
    .filter((lap) => {
      const start = lap.startTime instanceof Date ? lap.startTime : lap.timestamp;
      return start instanceof Date && start >= sessionStart && start <= sessionEnd;
    })
    .map((lap) => {
      const elapsed = Math.round(
        Number(lap.totalElapsedTime ?? lap.totalTimerTime ?? 0)
      );
      const moving = Math.round(Number(lap.totalTimerTime ?? 0));
      const wktStepIndex =
        lap.wktStepIndex != null ? Number(lap.wktStepIndex) : undefined;
      const lapTrigger =
        typeof lap.lapTrigger === "string" ? lap.lapTrigger : undefined;
      return {
        elapsedSeconds: elapsed,
        ...(moving > 0 ? { movingSeconds: moving } : {}),
        ...(Number.isInteger(wktStepIndex) ? { wktStepIndex } : {}),
        ...(lapTrigger ? { lapTrigger } : {}),
      };
    })
    .filter((l) => l.elapsedSeconds > 0);
}

function buildStreams(
  records: Array<Record<string, unknown>>,
  session?: Record<string, unknown>,
  messages?: Record<string, Array<Record<string, unknown>>>,
  sessionEnd?: Date
): NormalizedStreams {
  const streams: NormalizedStreams = emptyStreams();
  if (records.length === 0 && !session) return streams;

  const fieldDescriptions = messages?.fieldDescriptionMesgs ?? [];
  const elapsed = records.length > 0 ? elapsedSeconds(records) : [];
  if (elapsed.length > 0) streams.time = { data: elapsed };

  let watts = records.map((r) => recordPower(r, fieldDescriptions));
  const hr = records.map((r) => (r.heartRate as number) ?? 0);
  const vel = records.length > 0 ? deriveVelocity(records, elapsed) : [];
  const cadence = records.map((r) => {
    const c = (r.cadence as number) ?? 0;
    return typeof c === "number" && c > 0 ? c : 0;
  });
  const distances = records.map((r) => {
    const d = r.distance as number | undefined;
    return typeof d === "number" && d >= 0 ? d : 0;
  });

  const avgPower = session?.avgPower as number | undefined;
  if (!watts.some((w) => w > 0) && typeof avgPower === "number" && avgPower > 0) {
    watts = records.map(() => avgPower);
  }

  if (watts.some((w) => w > 0)) streams.watts = { data: watts };
  if (hr.some((h) => h > 0)) streams.heartrate = { data: hr };
  if (vel.some((v) => v > 0)) streams.velocity = { data: vel };
  if (cadence.some((c) => c > 0)) streams.cadence = { data: cadence };
  if (distances.some((d) => d > 0)) streams.distance = { data: distances };

  if (session && sessionEnd) {
    const sessionStart = sessionStartTime(session);
    const lengthMesgs = messages?.lengthMesgs as
      | Array<Record<string, unknown>>
      | undefined;
    const lapMesgs = messages?.lapMesgs as
      | Array<Record<string, unknown>>
      | undefined;
    const withLengths = mergePoolSwimStreams(
      streams,
      lengthMesgs,
      session,
      sessionStart,
      sessionEnd
    );
    return mergePoolSwimLapData(
      withLengths,
      lapMesgs,
      session,
      sessionStart,
      sessionEnd
    );
  }

  return streams;
}

function attachWorkoutLaps(
  streams: NormalizedStreams,
  lapMesgs: Array<Record<string, unknown>> | undefined,
  sessionStart: Date,
  sessionEnd: Date
): NormalizedStreams {
  const laps = extractWorkoutLaps(lapMesgs, sessionStart, sessionEnd);
  if (laps.length === 0) return streams;
  return { ...streams, workoutLaps: { data: laps } };
}

function buildStreamsWithLaps(
  records: Array<Record<string, unknown>>,
  session?: Record<string, unknown>,
  messages?: Record<string, Array<Record<string, unknown>>>,
  sessionEnd?: Date
): NormalizedStreams {
  const streams = buildStreams(records, session, messages, sessionEnd);
  if (!session || !sessionEnd || !messages?.lapMesgs) return streams;
  const sessionStart = sessionStartTime(session);
  return attachWorkoutLaps(
    streams,
    messages.lapMesgs as Array<Record<string, unknown>>,
    sessionStart,
    sessionEnd
  );
}

function attachSessionMeta(
  streams: NormalizedStreams,
  session: Record<string, unknown>
): NormalizedStreams {
  const elapsed = Math.round((session.totalElapsedTime as number) ?? 0);
  const moving = Math.round((session.totalTimerTime as number) ?? 0);
  const avgSpeed =
    (session.enhancedAvgSpeed as number) ?? (session.avgSpeed as number);
  const avgPower = session.avgPower as number | undefined;
  const avgHeartRate = session.avgHeartRate as number | undefined;
  const avgCadence =
    (session.avgCadence as number) ??
    (session.avgRunningCadence as number) ??
    (session.avgFractionalCadence as number);

  const meta: NonNullable<NormalizedStreams["meta"]> = {};
  if (elapsed > 0) meta.elapsedSeconds = elapsed;
  if (moving > 0) meta.movingSeconds = moving;
  if (typeof avgSpeed === "number" && avgSpeed > 0) meta.avgSpeedMps = avgSpeed;
  if (typeof avgPower === "number" && avgPower > 0) meta.avgPower = avgPower;
  if (typeof avgHeartRate === "number" && avgHeartRate > 0) {
    meta.avgHeartRate = avgHeartRate;
  }
  if (typeof avgCadence === "number" && avgCadence > 0) {
    meta.avgCadence = avgCadence;
  }
  const workoutFeel = session.workoutFeel as number | undefined;
  const workoutRpe = session.workoutRpe as number | undefined;
  if (typeof workoutFeel === "number" && workoutFeel >= 0) {
    meta.workoutFeel = Math.round(workoutFeel);
  }
  if (typeof workoutRpe === "number" && workoutRpe > 0) {
    meta.workoutRpe = Math.round(workoutRpe);
  }

  if (Object.keys(meta).length === 0) return streams;
  return { ...streams, meta };
}

function mapLegType(
  sport: unknown,
  subSport?: unknown
): ActivityLegType | null {
  const s = String(sport ?? "").toLowerCase();
  if (s === "transition") return "TRANSITION";
  const discipline = mapSport(sport, subSport);
  if (discipline === "SWIM") return "SWIM";
  if (discipline === "BIKE") return "BIKE";
  if (discipline === "RUN") return "RUN";
  return null;
}

function buildMultisportGroupId(
  sourceKey: string,
  firstStart: Date
): string {
  const payload = `multisport|${sourceKey}|${firstStart.toISOString()}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function legDisplayName(legType: ActivityLegType, transitionNumber: number): string {
  if (legType === "TRANSITION") {
    return transitionNumber === 1 ? "Transition 1" : "Transition 2";
  }
  if (legType === "SWIM") return "Swim";
  if (legType === "BIKE") return "Bike";
  return "Run";
}

function parseSession(
  session: Record<string, unknown>,
  records: Array<Record<string, unknown>>,
  messages: Record<string, Array<Record<string, unknown>>>,
  fallbackName: string,
  sessionIndex: number,
  sessionEnd: Date,
  multisport?: {
    groupId: string;
    transitionNumber: number;
  }
): ParsedActivity | null {
  const sport = String(session.sport ?? "").toLowerCase();
  const legType = mapLegType(session.sport, session.subSport);
  if (!legType) return null;

  const isTransition = sport === "transition";
  const discipline = isTransition ? "RUN" : mapSport(session.sport, session.subSport);
  if (!discipline) return null;

  const startTime = sessionStartTime(session);
  const durationSeconds = Math.round(
    (session.totalElapsedTime as number) ??
      (session.totalTimerTime as number) ??
      0
  );
  if (durationSeconds <= 0) return null;

  if (!isTransition && !isRecordedSession(session, records, messages)) return null;
  if (isTransition && records.length === 0 && durationSeconds < 5) return null;

  const name = multisport
    ? legDisplayName(legType, multisport.transitionNumber)
    : sessionIndex === 0
      ? buildFitActivityName(messages, session, discipline, startTime, fallbackName)
      : buildFitActivityName(
          messages,
          session,
          discipline,
          startTime,
          `${fallbackName} (session ${sessionIndex + 1})`
        );

  return {
    name,
    discipline,
    startTime,
    durationSeconds,
    distanceMeters: session.totalDistance as number | undefined,
    streams: attachSessionMeta(
      buildStreamsWithLaps(records, session, messages, sessionEnd),
      session
    ),
    selfEval: isTransition ? undefined : parseFitSessionSelfEval(session),
    isPrOrAchievement: false,
    multisportGroupId: multisport?.groupId,
    sessionIndex,
    legType: multisport ? legType : undefined,
  };
}

export function parseFitFile(
  bytes: Uint8Array,
  fallbackName: string,
  sourcePath?: string
): ParsedActivity[] {
  try {
    const stream = Stream.fromByteArray(Array.from(bytes));
    const decoder = new Decoder(stream);
    if (!decoder.isFIT()) return [];

    const { messages } = decoder.read();
    const msgMap = messages as Record<string, Array<Record<string, unknown>>>;
    if (classifyFitMessages(msgMap, sourcePath) !== "recorded_activity") {
      return [];
    }

    const sessions = (messages.sessionMesgs ?? []) as Array<Record<string, unknown>>;
    const records = (messages.recordMesgs ?? []) as Array<Record<string, unknown>>;
    if (sessions.length === 0) return [];

    const sorted = [...sessions].sort(
      (a, b) => sessionStartTime(a).getTime() - sessionStartTime(b).getTime()
    );

    const sportLegs = sorted.filter(
      (s) => String(s.sport ?? "").toLowerCase() !== "transition"
    );
    const isMultisport = sportLegs.length >= 2;
    const groupId = isMultisport
      ? buildMultisportGroupId(sourcePath ?? fallbackName, sessionStartTime(sorted[0]))
      : undefined;
    let transitionCount = 0;

    const activities: ParsedActivity[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const session = sorted[i];
      const start = sessionStartTime(session);
      const end = sessionEndTime(session, sorted[i + 1]);
      const sessionRecords = recordsForSession(records, start, end);
      const legType = mapLegType(session.sport, session.subSport);
      let transitionNumber = 0;
      if (legType === "TRANSITION") {
        transitionCount += 1;
        transitionNumber = transitionCount;
      }
      const parsed = parseSession(
        session,
        sessionRecords,
        messages as Record<string, Array<Record<string, unknown>>>,
        fallbackName,
        i,
        end,
        groupId ? { groupId, transitionNumber } : undefined
      );
      if (parsed) activities.push(parsed);
    }

    return activities;
  } catch {
    return [];
  }
}

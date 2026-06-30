export type FitImportKind =
  | "recorded_activity"
  | "course"
  | "workout_definition"
  | "non_activity";

/** Zip path segments that indicate courses, routes, or workout templates — not recorded activities. */
export function isNonActivityPath(path: string): boolean {
  const parts = path.toLowerCase().split(/[/\\]/);
  if (parts.includes("activities")) return false;
  const blocked = new Set(["courses", "course", "routes", "route", "workouts", "schedules"]);
  return parts.some((p) => blocked.has(p));
}

function hasMovementRecords(records: Array<Record<string, unknown>>): boolean {
  if (records.length >= 10) return true;
  return records.some(
    (r) =>
      ((r.power as number) ?? 0) > 0 ||
      ((r.heartRate as number) ?? 0) > 0 ||
      ((r.speed as number) ?? 0) > 0 ||
      ((r.enhancedSpeed as number) ?? 0) > 0
  );
}

function hasPowerOrHr(records: Array<Record<string, unknown>>): boolean {
  return records.some(
    (r) =>
      ((r.power as number) ?? 0) > 0 ||
      ((r.heartRate as number) ?? 0) > 0
  );
}

function speedLooksLikeCumulativeDistance(
  records: Array<Record<string, unknown>>
): boolean {
  const speeds = records.map(
    (r) => (r.speed as number) ?? (r.enhancedSpeed as number) ?? 0
  );
  if (!speeds.some((v) => v > 0)) return false;
  let increasing = 0;
  for (let i = 1; i < speeds.length; i++) {
    if (speeds[i] >= speeds[i - 1]) increasing++;
  }
  return increasing / Math.max(speeds.length - 1, 1) >= 0.95;
}

function sessionLooksRecorded(
  session: Record<string, unknown>,
  records: Array<Record<string, unknown>>,
  messages?: Record<string, Array<Record<string, unknown>>>
): boolean {
  const duration =
    (session.totalElapsedTime as number) ?? (session.totalTimerTime as number) ?? 0;
  const distance = (session.totalDistance as number) ?? 0;
  const avgPower = (session.avgPower as number) ?? 0;

  const workoutName = messages?.workoutMesgs?.[0]?.wktName ??
    messages?.workoutMesgs?.[0]?.workoutName;
  const hasWorkoutName =
    typeof workoutName === "string" && workoutName.trim().length > 0;

  if (
    hasWorkoutName &&
    !hasPowerOrHr(records) &&
    avgPower <= 0 &&
    speedLooksLikeCumulativeDistance(records)
  ) {
    return false;
  }

  if (duration >= 60 || distance >= 100) return true;
  return hasMovementRecords(records);
}

export function classifyFitMessages(
  messages: Record<string, Array<Record<string, unknown>>>,
  sourcePath?: string
): FitImportKind {
  if (sourcePath && isNonActivityPath(sourcePath)) {
    const lower = sourcePath.toLowerCase();
    if (lower.includes("workout")) return "workout_definition";
    return "course";
  }

  const fileType = String(messages.fileIdMesgs?.[0]?.type ?? "").toLowerCase();
  if (fileType === "course") return "course";
  if (fileType === "workout") return "workout_definition";
  if (["schedules", "sport", "settings", "device", "goals"].includes(fileType)) {
    return "non_activity";
  }

  const sessions = messages.sessionMesgs ?? [];
  const records = messages.recordMesgs ?? [];
  const hasCourse = (messages.courseMesgs?.length ?? 0) > 0;
  const hasWorkoutSteps =
    (messages.workoutMesgs?.length ?? 0) > 0 && sessions.length === 0;

  if (hasWorkoutSteps) return "workout_definition";
  if (sessions.length === 0) return "non_activity";

  const anyRecorded = sessions.some((session) => {
    const start =
      session.startTime instanceof Date
        ? session.startTime
        : session.timestamp instanceof Date
          ? session.timestamp
          : null;
    const sessionRecords =
      start && records.length > 0
        ? records.filter((r) => {
            const t = r.timestamp;
            return t instanceof Date && t >= start;
          })
        : records;
    return sessionLooksRecorded(session, sessionRecords, messages);
  });

  if (!anyRecorded) {
    return "course";
  }

  if (hasCourse && !anyRecorded) return "course";

  return "recorded_activity";
}

export function isRecordedSession(
  session: Record<string, unknown>,
  records: Array<Record<string, unknown>>,
  messages?: Record<string, Array<Record<string, unknown>>>
): boolean {
  return sessionLooksRecorded(session, records, messages);
}

/** Prisma filter: exclude imported course/route stubs from activity lists. */
export const recordedActivityWhere = {
  NOT: {
    AND: [
      { durationSeconds: { lte: 30 } },
      { noUsableSignal: true },
      { OR: [{ distanceMeters: null }, { distanceMeters: 0 }] },
    ],
  },
};

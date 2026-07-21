import type { Discipline } from "@prisma/client";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { formatDateKey, parseDateKey } from "@/lib/dates";
import { isSessionPlanningEnabled } from "@/lib/features";
import { recordedActivityWhere } from "@/lib/import/classify";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import { markFolderWorkoutCompleted } from "@/lib/workout/workout-folder-library";
import { inngest } from "@/inngest/client";
export class SessionLinkError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SessionLinkError";
  }
}

function sameCalendarDay(activityStart: Date, scheduledDate: Date): boolean {
  // scheduledDate is @db.Date (UTC midnight) — use formatDateKey, not local format().
  return format(activityStart, "yyyy-MM-dd") === formatDateKey(scheduledDate);
}

function disciplinesCompatible(sessionDiscipline: Discipline, activityDiscipline: Discipline): boolean {
  return sessionDiscipline === activityDiscipline;
}

export function resolveAutoLinkDateKey(startTime: Date, matchDateKey?: string): string {
  return matchDateKey ?? format(startTime, "yyyy-MM-dd");
}

/** First candidate by ascending id (proxy for creation order). Input must be pre-filtered. */
export function pickFirstAutoLinkCandidate<T extends { id: string }>(
  candidates: T[]
): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

export async function linkActivityToPlannedSession(
  athleteId: string,
  sessionId: string,
  activityId: string,
  options?: { skipCalendarDayCheck?: boolean }
) {
  const [session, activity] = await Promise.all([
    db.plannedSession.findFirst({
      where: { id: sessionId, athleteId },
      select: { id: true, discipline: true, scheduledDate: true, linkedActivityId: true },
    }),
    db.syncedActivity.findFirst({
      where: { id: activityId, athleteId, ...recordedActivityWhere },
      select: { id: true, discipline: true, startTime: true },
    }),
  ]);

  if (!session) {
    throw new SessionLinkError("Planned session not found", 404);
  }
  if (!activity) {
    throw new SessionLinkError("Activity not found", 404);
  }
  if (!disciplinesCompatible(session.discipline, activity.discipline)) {
    throw new SessionLinkError("Sport must match between planned session and activity", 400);
  }
  if (
    !options?.skipCalendarDayCheck &&
    !sameCalendarDay(activity.startTime, session.scheduledDate)
  ) {
    throw new SessionLinkError("Activity must be on the same day as the planned session", 400);
  }

  await db.$transaction(async (tx) => {
    await tx.plannedSession.updateMany({
      where: { athleteId, linkedActivityId: activityId, NOT: { id: sessionId } },
      data: { linkedActivityId: null },
    });
    await tx.plannedSession.update({
      where: { id: sessionId },
      data: { linkedActivityId: activityId },
    });
    await markFolderWorkoutCompleted(tx, sessionId);
  });

  // Role-aware TiZ may differ once the planned session role is known.
  await inngest.send({
    name: "activity/zones.compute",
    data: { activityId },
  });

  return { sessionId, activityId };
}

export async function unlinkPlannedSessionActivity(athleteId: string, sessionId: string) {
  const session = await db.plannedSession.findFirst({
    where: { id: sessionId, athleteId },
    select: { id: true, linkedActivityId: true },
  });
  if (!session) {
    throw new SessionLinkError("Planned session not found", 404);
  }
  if (!session.linkedActivityId) {
    return { sessionId, activityId: null };
  }

  const activityId = session.linkedActivityId;
  await db.plannedSession.update({
    where: { id: sessionId },
    data: { linkedActivityId: null },
  });

  await inngest.send({
    name: "activity/zones.compute",
    data: { activityId },
  });

  return { sessionId, activityId };
}

export async function findPlannedSessionForActivity(athleteId: string, activityId: string) {
  return db.plannedSession.findFirst({
    where: { athleteId, linkedActivityId: activityId },
    include: { structuredWorkout: true },
  });
}

export async function tryAutoLinkActivityToPlannedSession(
  athleteId: string,
  activityId: string,
  options?: { matchDateKey?: string }
): Promise<{ sessionId: string; activityId: string } | null> {
  if (!isSessionPlanningEnabled()) return null;

  const activity = await db.syncedActivity.findFirst({
    where: { id: activityId, athleteId, ...recordedActivityWhere },
    select: { id: true, discipline: true, startTime: true },
  });
  if (!activity) return null;

  const existing = await findPlannedSessionForActivity(athleteId, activityId);
  if (existing) return null;

  const dateKey = resolveAutoLinkDateKey(activity.startTime, options?.matchDateKey);
  const candidates = await db.plannedSession.findMany({
    where: {
      athleteId,
      discipline: activity.discipline,
      linkedActivityId: null,
      scheduledDate: parseDateKey(dateKey),
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  const candidate = pickFirstAutoLinkCandidate(candidates);
  if (!candidate) return null;

  return linkActivityToPlannedSession(athleteId, candidate.id, activityId, {
    skipCalendarDayCheck: Boolean(options?.matchDateKey),
  });
}

export type ResolveSessionForActivityResult = {
  sessionId: string;
  created: boolean;
};

export type SessionResolveDecision =
  | { action: "existing"; sessionId: string }
  | { action: "autolink"; sessionId: string }
  | { action: "create" };

export function planSessionResolution(input: {
  existingSessionId: string | null;
  autoLinkSessionId: string | null;
}): SessionResolveDecision {
  if (input.existingSessionId) {
    return { action: "existing", sessionId: input.existingSessionId };
  }
  if (input.autoLinkSessionId) {
    return { action: "autolink", sessionId: input.autoLinkSessionId };
  }
  return { action: "create" };
}

/** Find or create the canonical planned session for an imported activity. */
export async function resolveOrCreateSessionForActivity(
  athleteId: string,
  activityId: string
): Promise<ResolveSessionForActivityResult> {
  if (!isSessionPlanningEnabled()) {
    throw new SessionLinkError("Session planning is not enabled", 503);
  }

  const activity = await db.syncedActivity.findFirst({
    where: { id: activityId, athleteId, ...recordedActivityWhere },
    select: { id: true, name: true, discipline: true, startTime: true },
  });
  if (!activity) {
    throw new SessionLinkError("Activity not found", 404);
  }

  const existing = await findPlannedSessionForActivity(athleteId, activityId);
  const autoLink = existing
    ? null
    : await tryAutoLinkActivityToPlannedSession(athleteId, activityId);

  const decision = planSessionResolution({
    existingSessionId: existing?.id ?? null,
    autoLinkSessionId: autoLink?.sessionId ?? null,
  });

  if (decision.action === "existing" || decision.action === "autolink") {
    return { sessionId: decision.sessionId, created: false };
  }

  const scheduledDate = parseDateKey(format(activity.startTime, "yyyy-MM-dd"));
  const zoneAllocationMissing = computeZoneAllocationMissing(activity.discipline, undefined);

  const session = await db.plannedSession.create({
    data: {
      athleteId,
      scheduledDate,
      discipline: activity.discipline,
      title: activity.name,
      linkedActivityId: activityId,
      source: "FLEXIBLE",
      zoneAllocationMissing,
    },
    select: { id: true },
  });

  return { sessionId: session.id, created: true };
}

export async function getLinkedActivityIdsForAthlete(athleteId: string): Promise<Set<string>> {
  const rows = await db.plannedSession.findMany({
    where: { athleteId, linkedActivityId: { not: null } },
    select: { linkedActivityId: true },
  });
  return new Set(rows.map((r) => r.linkedActivityId!).filter(Boolean));
}

export function parseActivityDragId(id: string | number): string | null {
  const raw = String(id);
  return raw.startsWith("activity:") ? raw.slice("activity:".length) : null;
}

export function parseSessionLinkDropId(id: string | number): string | null {
  const raw = String(id);
  return raw.startsWith("link:") ? raw.slice("link:".length) : null;
}

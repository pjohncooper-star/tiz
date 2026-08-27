import type { SessionRole } from "@prisma/client";
import { inngest } from "@/inngest/client";
import { parseDateKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { nextDaySortOrderForDate } from "@/lib/plan/session-day-order.server";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import { zoneKey } from "@/lib/workout/steps";
import { parseTrainerRoadCalendar } from "./calendar";
import { unlinkTrainerRoadSeasons, syncTrainerRoadDrivenSeasons } from "./season.server";
import { trainerRoadSessionNotes } from "./url";

const ROLE_ZONE_SHARE: Record<SessionRole, Partial<Record<number, number>>> = {
  EASY: { 1: 0.55, 2: 0.45 },
  MODERATE: { 2: 1 },
  INTENSITY: { 3: 0.55, 4: 0.3, 5: 0.15 },
  LONG: { 1: 0.1, 2: 0.9 },
};

export type TrainerRoadSyncResult = {
  upserted: number;
  removed: number;
  workoutCount: number;
  phaseCount: number;
  syncedAt: string;
  season?: {
    updated: boolean;
    seasons?: Array<{ id: string; name: string }>;
    error?: string;
    overlapping?: Array<{ id: string; name: string; startDate: string; endDate: string }>;
  };
};

export async function fetchTrainerRoadIcs(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/calendar, text/plain, */*" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`TrainerRoad calendar returned ${response.status}`);
  }
  const text = await response.text();
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("That URL did not return a calendar feed");
  }
  return text;
}

/** Queue a debounced iCal refresh if this athlete has a TrainerRoad calendar URL. */
export async function scheduleTrainerRoadRefresh(athleteId: string): Promise<boolean> {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { trainerRoadIcalUrl: true },
  });
  if (!athlete?.trainerRoadIcalUrl) return false;
  await inngest.send({
    name: "trainerroad/calendar.refresh",
    data: { athleteId },
  });
  return true;
}

/** Fetch and ingest the athlete's TrainerRoad calendar. No-op if no URL is saved. */
export async function refreshTrainerRoadCalendarForAthlete(athleteId: string) {
  const athlete = await db.athlete.findUnique({
    where: { id: athleteId },
    select: { trainerRoadIcalUrl: true },
  });
  if (!athlete?.trainerRoadIcalUrl) {
    return { skipped: true as const };
  }
  const ics = await fetchTrainerRoadIcs(athlete.trainerRoadIcalUrl);
  return syncTrainerRoadCalendar(athleteId, ics);
}

function todayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function targetZonesForRole(
  role: SessionRole,
  minutes: number
): Record<string, number> | undefined {
  if (!(minutes > 0)) return undefined;
  const shares = ROLE_ZONE_SHARE[role];
  const zones: Record<string, number> = {};
  for (const zone of [1, 2, 3, 4, 5] as const) {
    const share = shares[zone];
    if (!share) continue;
    const value = Math.round(minutes * share);
    if (value > 0) zones[zoneKey("BIKE", zone)] = value;
  }
  return Object.keys(zones).length > 0 ? zones : undefined;
}

export async function syncTrainerRoadCalendar(
  athleteId: string,
  ics: string
): Promise<TrainerRoadSyncResult> {
  const parsed = parseTrainerRoadCalendar(ics);
  const today = todayUtcDateKey();
  const seenUids = new Set<string>();
  let upserted = 0;

  for (const workout of parsed.workouts) {
    const uid = workout.uid.trim().slice(0, 191);
    if (!uid) continue;
    seenUids.add(uid);

    const scheduledDate = parseDateKey(workout.dateKey);
    const sessionRole = workout.sessionRole ?? "MODERATE";
    const duration = workout.durationMinutes;
    const targetZones = duration != null ? targetZonesForRole(sessionRole, duration) : undefined;
    const existing = await db.plannedSession.findFirst({
      where: { athleteId, source: "TRAINERROAD", externalUid: uid },
      select: { id: true, linkedActivityId: true },
    });

    if (existing?.linkedActivityId) continue;

    const data = {
      scheduledDate,
      title: workout.title.slice(0, 200) || "Bike",
      notes: trainerRoadSessionNotes(workout),
      estimatedDurationMinutes: duration,
      sessionRole,
      targetZones,
      zoneAllocationMissing: computeZoneAllocationMissing("BIKE", targetZones, duration),
    };

    if (existing) {
      await db.plannedSession.update({ where: { id: existing.id }, data });
    } else {
      await db.plannedSession.create({
        data: {
          athleteId,
          discipline: "BIKE",
          source: "TRAINERROAD",
          externalUid: uid,
          daySortOrder: await nextDaySortOrderForDate(db, athleteId, scheduledDate),
          ...data,
        },
      });
    }
    upserted += 1;
  }

  const stale = await db.plannedSession.findMany({
    where: {
      athleteId,
      source: "TRAINERROAD",
      linkedActivityId: null,
      scheduledDate: { gte: parseDateKey(today) },
      NOT: { externalUid: { in: [...seenUids] } },
    },
    select: { id: true },
  });
  if (stale.length > 0) {
    await db.plannedSession.deleteMany({
      where: { id: { in: stale.map((row) => row.id) } },
    });
  }

  const syncedAt = new Date();
  await db.athlete.update({
    where: { id: athleteId },
    data: { trainerRoadSyncedAt: syncedAt },
  });

  let season: TrainerRoadSyncResult["season"];
  try {
    const seasonResult = await syncTrainerRoadDrivenSeasons(athleteId, ics);
    if (seasonResult.seasons.length > 0 || seasonResult.error || seasonResult.updated) {
      season = {
        updated: seasonResult.updated,
        seasons: seasonResult.seasons,
        error: seasonResult.error,
        overlapping: seasonResult.overlapping,
      };
    }
  } catch (error) {
    season = {
      updated: false,
      error: error instanceof Error ? error.message : "Could not update TrainerRoad season",
    };
  }

  return {
    upserted,
    removed: stale.length,
    workoutCount: parsed.workouts.length,
    phaseCount: parsed.phaseMarkers.length,
    syncedAt: syncedAt.toISOString(),
    season,
  };
}

export async function disconnectTrainerRoad(athleteId: string): Promise<void> {
  const today = parseDateKey(todayUtcDateKey());
  await unlinkTrainerRoadSeasons(athleteId);
  await db.$transaction([
    db.plannedSession.deleteMany({
      where: {
        athleteId,
        source: "TRAINERROAD",
        linkedActivityId: null,
        scheduledDate: { gte: today },
      },
    }),
    db.athlete.update({
      where: { id: athleteId },
      data: {
        trainerRoadIcalUrl: null,
        trainerRoadSyncedAt: null,
      },
    }),
  ]);
}

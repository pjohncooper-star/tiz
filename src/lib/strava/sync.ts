import { upsertSyncedActivity } from "@/lib/activity/upsert-synced";
import { db } from "@/lib/db";
import { scheduleTrainerRoadRefresh } from "@/lib/plan/trainerroad/sync";
import type { NormalizedStreams } from "@/lib/zones/compute";
import {
  mapStravaType,
  refreshStravaToken,
  stravaFetch,
} from "./client";
import { fetchStravaActivityLaps, mapStravaLapsToSwimLaps } from "./laps";
import { mapStravaStreams, STRAVA_STREAM_KEYS } from "./map-streams";

async function getToken(athleteId: string) {
  const conn = await db.stravaConnection.findUnique({ where: { athleteId } });
  if (!conn) throw new Error("No Strava connection");
  if (conn.expiresAt > new Date()) return conn.accessToken;
  const r = await refreshStravaToken(conn.refreshToken);
  await db.stravaConnection.update({
    where: { athleteId },
    data: {
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      expiresAt: new Date(r.expires_at * 1000),
    },
  });
  return r.access_token;
}

export async function syncStravaActivity(athleteId: string, stravaId: number) {
  const token = await getToken(athleteId);
  const activity = await stravaFetch<{
    id: number;
    name: string;
    type: string;
    start_date: string;
    start_date_local?: string;
    timezone?: string;
    utc_offset?: number;
    moving_time: number;
    elapsed_time: number;
    distance?: number;
  }>(`/activities/${stravaId}`, token);

  const discipline = mapStravaType(activity.type);
  if (!discipline) return null;

  let streams: NormalizedStreams = {};
  try {
    streams = mapStravaStreams(await fetchActivityStreams(stravaId, token));
  } catch {
    streams = {};
  }

  if (discipline === "SWIM") {
    try {
      const laps = await fetchStravaActivityLaps(stravaId, token);
      const swimLaps = mapStravaLapsToSwimLaps(
        laps,
        new Date(activity.start_date)
      );
      if (swimLaps) {
        streams = { ...streams, swimLaps: { data: swimLaps } };
      }
    } catch {
      // Laps are optional; open-water swims may rely on velocity streams.
    }
  }

  const utcOffsetSeconds =
    typeof activity.utc_offset === "number" && Number.isFinite(activity.utc_offset)
      ? Math.round(activity.utc_offset)
      : null;

  const elapsedSeconds =
    typeof activity.elapsed_time === "number" && activity.elapsed_time > 0
      ? activity.elapsed_time
      : activity.moving_time;
  const movingSeconds =
    typeof activity.moving_time === "number" && activity.moving_time > 0
      ? activity.moving_time
      : null;

  // Persist wall-clock elapsed so swim TiZ (rest → Z1) can budget against it.
  streams = {
    ...streams,
    meta: {
      ...streams.meta,
      elapsedSeconds,
      ...(movingSeconds != null ? { movingSeconds } : {}),
    },
  };

  const synced = await upsertSyncedActivity(
    athleteId,
    {
      name: activity.name,
      discipline,
      startTime: new Date(activity.start_date),
      utcOffsetSeconds,
      // Keep moving time for activity matching; elapsed lives on streams.meta.
      durationSeconds: activity.moving_time,
      distanceMeters: activity.distance,
      externalId: String(activity.id),
      rawStreams: streams,
      source: "STRAVA_LIVE",
    },
    {
      matchDurationSeconds: activity.moving_time,
      linkPlannedSession: true,
    }
  );

  try {
    await scheduleTrainerRoadRefresh(athleteId);
  } catch {
    // TrainerRoad scheduling must not fail Strava ingest.
  }

  return synced;
}

async function fetchActivityStreams(id: number, token: string) {
  return stravaFetch<unknown>(
    `/activities/${id}/streams?keys=${STRAVA_STREAM_KEYS}&key_by_type=true`,
    token
  );
}

export async function syncRecentActivities(athleteId: string) {
  const token = await getToken(athleteId);
  const activities = await stravaFetch<{ id: number }[]>(
    `/athlete/activities?per_page=30`,
    token
  );
  for (const a of activities) await syncStravaActivity(athleteId, a.id);
}

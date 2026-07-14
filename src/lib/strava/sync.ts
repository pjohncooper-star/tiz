import { upsertSyncedActivity } from "@/lib/activity/upsert-synced";
import { db } from "@/lib/db";
import type { NormalizedStreams } from "@/lib/zones/compute";
import {
  mapStravaType,
  refreshStravaToken,
  stravaFetch,
} from "./client";
import { fetchStravaActivityLaps, mapStravaLapsToSwimLaps } from "./laps";

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
    distance?: number;
  }>(`/activities/${stravaId}`, token);

  const discipline = mapStravaType(activity.type);
  if (!discipline) return null;

  let streams: NormalizedStreams = {};
  try {
    const raw = await fetchActivityStreams(stravaId, token);
    if (Array.isArray(raw)) {
      for (const s of raw) {
        if (s.type === "time") streams.time = { data: s.data };
        if (s.type === "watts") streams.watts = { data: s.data };
        if (s.type === "heartrate") streams.heartrate = { data: s.data };
        if (s.type === "velocity_smooth") streams.velocity = { data: s.data };
        if (s.type === "cadence") streams.cadence = { data: s.data };
        if (s.type === "distance") streams.distance = { data: s.data };
      }
    } else if (raw && typeof raw === "object") {
      const o = raw as Record<string, { data: number[] }>;
      if (o.time) streams.time = { data: o.time.data };
      if (o.watts) streams.watts = { data: o.watts.data };
      if (o.heartrate) streams.heartrate = { data: o.heartrate.data };
      if (o.velocity_smooth) streams.velocity = { data: o.velocity_smooth.data };
      if (o.cadence) streams.cadence = { data: o.cadence.data };
      if (o.distance) streams.distance = { data: o.distance.data };
    }
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

  const synced = await upsertSyncedActivity(
    athleteId,
    {
      name: activity.name,
      discipline,
      startTime: new Date(activity.start_date),
      utcOffsetSeconds,
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

  return synced;
}

async function fetchActivityStreams(id: number, token: string) {
  return stravaFetch<unknown>(
    `/activities/${id}/streams?keys=time,watts,heartrate,velocity_smooth,cadence,distance&key_by_type=true`,
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

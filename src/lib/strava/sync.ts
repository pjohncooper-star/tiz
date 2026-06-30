import { db } from "@/lib/db";
import { buildDedupFingerprint } from "@/lib/import/dedup";
import { tryAutoLinkActivityToPlannedSession } from "@/lib/plan/session-link";
import { inngest } from "@/inngest/client";
import type { NormalizedStreams } from "@/lib/zones/compute";
import {
  mapStravaType,
  refreshStravaToken,
  stravaFetch,
} from "./client";

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

  const fingerprint = buildDedupFingerprint(
    discipline,
    new Date(activity.start_date),
    activity.moving_time,
    activity.distance
  );

  const synced = await db.syncedActivity.upsert({
    where: { athleteId_dedupFingerprint: { athleteId, dedupFingerprint: fingerprint } },
    create: {
      athleteId,
      externalId: String(activity.id),
      dedupFingerprint: fingerprint,
      discipline,
      name: activity.name,
      startTime: new Date(activity.start_date),
      durationSeconds: activity.moving_time,
      distanceMeters: activity.distance,
      source: "STRAVA_LIVE",
      rawStreams: streams,
      streamsFetched: true,
    },
    update: {
      name: activity.name,
      rawStreams: streams,
      zoneComputed: false,
    },
  });

  await inngest.send({ name: "activity/zones.compute", data: { activityId: synced.id } });
  await tryAutoLinkActivityToPlannedSession(athleteId, synced.id);
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

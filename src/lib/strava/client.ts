import type { Discipline } from "@prisma/client";
import { getAppUrl } from "@/lib/app-url";

const API = "https://www.strava.com/api/v3";
export const STRAVA_SCOPES = "read,activity:read_all";

export function mapStravaType(type: string): Discipline | null {
  const t = type.toLowerCase();
  if (["ride", "virtualride", "ebikeride", "gravelride"].includes(t)) return "BIKE";
  if (["run", "trailrun", "virtualrun"].includes(t)) return "RUN";
  if (t === "swim") return "SWIM";
  return null;
}

export function getStravaAuthUrl(state: string, req?: Request) {
  const p = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${getAppUrl(req)}/api/strava/callback`,
    response_type: "code",
    scope: STRAVA_SCOPES,
    state,
  });
  return `https://www.strava.com/oauth/authorize?${p}`;
}

export async function exchangeStravaCode(code: string, req?: Request) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${getAppUrl(req)}/api/strava/callback`,
    }),
  });
  if (!res.ok) throw new Error("Strava token exchange failed");
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete: { id: number };
  }>;
}

export async function refreshStravaToken(refreshToken: string) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Strava refresh failed");
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
  }>;
}

export async function stravaFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava ${res.status}`);
  return res.json() as Promise<T>;
}

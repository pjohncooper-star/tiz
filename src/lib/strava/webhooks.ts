import { getAppUrl } from "@/lib/app-url";

type PushSubscription = {
  id: number;
  callback_url: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function listStravaWebhookSubscriptions(): Promise<PushSubscription[]> {
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const clientSecret = requireEnv("STRAVA_CLIENT_SECRET");
  const url = new URL("https://www.strava.com/api/v3/push_subscriptions");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Strava list webhooks failed: ${res.status}`);
  }
  return res.json() as Promise<PushSubscription[]>;
}

/** Register app-level Strava push subscription if not already present. */
export async function ensureStravaWebhookSubscription(
  appUrl?: string
): Promise<{ id: number; created: boolean }> {
  const base = appUrl ?? getAppUrl();
  const callbackUrl = `${base.replace(/\/$/, "")}/api/webhooks/strava`;
  const verifyToken = requireEnv("STRAVA_WEBHOOK_VERIFY_TOKEN");
  const clientId = requireEnv("STRAVA_CLIENT_ID");
  const clientSecret = requireEnv("STRAVA_CLIENT_SECRET");

  const existing = await listStravaWebhookSubscriptions();
  const match = existing.find((s) => s.callback_url === callbackUrl);
  if (match) return { id: match.id, created: false };

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: callbackUrl,
    verify_token: verifyToken,
  });
  const res = await fetch("https://www.strava.com/api/v3/push_subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava webhook registration failed: ${res.status} ${text}`);
  }
  const sub = (await res.json()) as { id: number };
  return { id: sub.id, created: true };
}

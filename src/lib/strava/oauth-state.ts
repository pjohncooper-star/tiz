export type StravaOAuthState = {
  athleteId: string;
  returnTo: string;
};

export const STRAVA_OAUTH_DEFAULT_RETURN = "/onboarding/day-flags";

/** Allow only same-origin relative paths (no open redirects). */
export function safeReturnPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return STRAVA_OAUTH_DEFAULT_RETURN;
  }
  return path;
}

export function encodeStravaOAuthState(payload: StravaOAuthState): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeStravaOAuthState(state: string): StravaOAuthState | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8")
    ) as StravaOAuthState;
    if (!parsed.athleteId || typeof parsed.athleteId !== "string") return null;
    return {
      athleteId: parsed.athleteId,
      returnTo: safeReturnPath(parsed.returnTo),
    };
  } catch {
    return null;
  }
}

/** Supports encoded state or legacy raw athleteId in `state`. */
export function parseStravaOAuthState(state: string): StravaOAuthState {
  const decoded = decodeStravaOAuthState(state);
  if (decoded) return decoded;
  return { athleteId: state, returnTo: STRAVA_OAUTH_DEFAULT_RETURN };
}

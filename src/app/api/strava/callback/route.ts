import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { advanceOnboardingTo } from "@/lib/onboarding";
import { exchangeStravaCode } from "@/lib/strava/client";
import {
  parseStravaOAuthState,
  STRAVA_OAUTH_DEFAULT_RETURN,
} from "@/lib/strava/oauth-state";
import { syncRecentActivities } from "@/lib/strava/sync";

/** Keep the settings sub-page the athlete started from, tagged with the outcome. */
function settingsReturnUrl(returnTo: string, status: string, base: string) {
  const url = new URL(returnTo, base);
  url.searchParams.set("strava", status);
  return url;
}

function errorRedirect(req: Request, returnTo: string) {
  const base = getAppUrl(req);
  if (returnTo.startsWith("/settings")) {
    return NextResponse.redirect(settingsReturnUrl(returnTo, "error", base));
  }
  return NextResponse.redirect(new URL("/onboarding/strava?error=1", base));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  if (!code || !stateParam) {
    return errorRedirect(req, STRAVA_OAUTH_DEFAULT_RETURN);
  }

  const oauthState = parseStravaOAuthState(stateParam);
  const session = await auth();
  if (!session?.user?.athleteId || session.user.athleteId !== oauthState.athleteId) {
    return errorRedirect(req, oauthState.returnTo);
  }

  try {
    const token = await exchangeStravaCode(code, req);
    const athleteId = oauthState.athleteId;
    await db.stravaConnection.upsert({
      where: { athleteId },
      create: {
        athleteId,
        stravaAthleteId: BigInt(token.athlete.id),
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(token.expires_at * 1000),
      },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: new Date(token.expires_at * 1000),
      },
    });
    await syncRecentActivities(athleteId);

    // Onboarding Strava step (and legacy DAY_FLAGS) finishes here — not Workout Signaling.
    if (
      !oauthState.returnTo.startsWith("/settings") &&
      (oauthState.returnTo === "/dashboard" ||
        oauthState.returnTo.startsWith("/onboarding/"))
    ) {
      await advanceOnboardingTo(athleteId, "COMPLETE");
    }

    const base = getAppUrl(req);
    const successUrl = oauthState.returnTo.startsWith("/settings")
      ? settingsReturnUrl(oauthState.returnTo, "connected", base)
      : new URL(oauthState.returnTo, base);

    return NextResponse.redirect(successUrl);
  } catch {
    return errorRedirect(req, oauthState.returnTo);
  }
}

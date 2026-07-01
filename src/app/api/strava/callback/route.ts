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



function errorRedirect(req: Request, returnTo: string) {

  const path = returnTo.startsWith("/settings")

    ? "/settings?strava=error"

    : "/onboarding/strava?error=1";

  return NextResponse.redirect(new URL(path, getAppUrl(req)));

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



    if (oauthState.returnTo.startsWith("/onboarding/")) {

      await advanceOnboardingTo(athleteId, "DAY_FLAGS");

    }



    const successPath = oauthState.returnTo.startsWith("/settings")

      ? "/settings?strava=connected"

      : oauthState.returnTo;



    return NextResponse.redirect(new URL(successPath, getAppUrl(req)));

  } catch {

    return errorRedirect(req, oauthState.returnTo);

  }

}


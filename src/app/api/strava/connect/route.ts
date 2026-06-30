import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStravaAuthUrl } from "@/lib/strava/client";
import {
  encodeStravaOAuthState,
  safeReturnPath,
} from "@/lib/strava/oauth-state";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const returnTo = safeReturnPath(searchParams.get("returnTo"));
  const state = encodeStravaOAuthState({
    athleteId: session.user.athleteId,
    returnTo,
  });

  return NextResponse.redirect(getStravaAuthUrl(state, req));
}

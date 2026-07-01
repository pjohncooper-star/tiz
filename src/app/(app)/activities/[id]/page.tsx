import { notFound, redirect } from "next/navigation";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activityReturnHrefFromStartTime } from "@/lib/plan/activity-return";
import {
  resolveOrCreateSessionForActivity,
  SessionLinkError,
} from "@/lib/plan/session-link";
import { workoutHref } from "@/lib/plan/workout-href";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await requireAthlete();
  const { id } = await params;
  const { returnTo } = await searchParams;
  const athleteId = session.user.athleteId!;

  const activity = await db.syncedActivity.findFirst({
    where: { id, athleteId },
    select: { startTime: true },
  });
  if (!activity) notFound();

  let sessionId: string;
  try {
    ({ sessionId } = await resolveOrCreateSessionForActivity(athleteId, id));
  } catch (error) {
    if (error instanceof SessionLinkError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const sessionReturn =
    returnTo ?? activityReturnHrefFromStartTime(activity.startTime.toISOString());

  redirect(workoutHref(sessionId, { returnTo: sessionReturn }));
}

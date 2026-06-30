import { notFound, redirect } from "next/navigation";
import { ActivityDetailFallback } from "@/components/activity-detail-fallback";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activityReturnHrefFromStartTime, resolveActivityReturnHref } from "@/lib/plan/activity-return";
import { isSessionPlanningEnabled } from "@/lib/features";
import {
  resolveOrCreateSessionForActivity,
  SessionLinkError,
} from "@/lib/plan/session-link";

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
  const returnHref = resolveActivityReturnHref(returnTo);
  const athleteId = session.user.athleteId!;

  const activity = await db.syncedActivity.findFirst({
    where: { id, athleteId },
    include: {
      surveyResponse: true,
      zoneBreakdowns: {
        orderBy: [{ isCanonical: "desc" }, { zone: "asc" }],
        include: { thresholdProfile: true },
      },
    },
  });
  if (!activity) notFound();

  if (isSessionPlanningEnabled()) {
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
    redirect(
      `/plan/sessions/${sessionId}?returnTo=${encodeURIComponent(sessionReturn)}`
    );
  }

  const disciplineSettings = await db.athleteDisciplineSettings.findMany({
    where: { athleteId },
    select: { discipline: true, displayUnit: true },
  });
  const displayUnit =
    disciplineSettings.find((s) => s.discipline === activity.discipline)
      ?.displayUnit ?? "METRIC";

  return (
    <ActivityDetailFallback
      athleteId={athleteId}
      returnHref={returnHref}
      activity={activity}
      displayUnit={displayUnit}
    />
  );
}

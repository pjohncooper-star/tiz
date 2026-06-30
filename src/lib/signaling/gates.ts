import { differenceInMonths } from "date-fns";
import { db } from "@/lib/db";
import { SIGNALING_ACTIVATION_MONTHS } from "@/lib/onboarding";

export async function getSignalingGateStatus(athleteId: string) {
  const activities = await db.syncedActivity.findMany({
    where: { athleteId, zoneComputed: true },
    orderBy: { startTime: "asc" },
    select: { startTime: true },
  });

  if (activities.length === 0) {
    return {
      monthsOfHistory: 0,
      requiredMonths: SIGNALING_ACTIVATION_MONTHS,
      activated: false,
      eligibleDayCount: 0,
      message: "Import your training history to unlock Workout Signaling.",
    };
  }

  const first = activities[0].startTime;
  const last = activities[activities.length - 1].startTime;
  const monthsOfHistory = differenceInMonths(last, first);
  const activated = monthsOfHistory >= SIGNALING_ACTIVATION_MONTHS;

  const eligibleDayCount = activities.filter((a) => {
    const trailingMonths = differenceInMonths(a.startTime, first);
    return trailingMonths >= SIGNALING_ACTIVATION_MONTHS;
  }).length;

  return {
    monthsOfHistory,
    requiredMonths: SIGNALING_ACTIVATION_MONTHS,
    activated,
    eligibleDayCount,
    message: activated
      ? "Workout Signaling is active for your imported history."
      : `Import ${SIGNALING_ACTIVATION_MONTHS - monthsOfHistory} more months of history to activate Workout Signaling.`,
  };
}

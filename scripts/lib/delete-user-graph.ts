import type { PrismaClient } from "@prisma/client";

/** Delete user + athlete data. ZoneBreakdown must go first (ThresholdProfile FK is RESTRICT). */
export async function deleteUserByEmail(db: PrismaClient, email: string) {
  const user = await db.user.findUnique({
    where: { email },
    include: { athlete: { select: { id: true } } },
  });
  if (!user) return null;

  if (user.athlete) {
    const athleteId = user.athlete.id;
    const activities = await db.syncedActivity.findMany({
      where: { athleteId },
      select: { id: true },
    });
    const activityIds = activities.map((a) => a.id);
    if (activityIds.length > 0) {
      await db.zoneBreakdown.deleteMany({
        where: { activityId: { in: activityIds } },
      });
    }
  }

  await db.user.delete({ where: { id: user.id } });
  return user;
}

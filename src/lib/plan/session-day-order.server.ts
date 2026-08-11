import type { Prisma, PrismaClient } from "@prisma/client";
import { parseDateKey } from "@/lib/dates";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Next daySortOrder for a new/moved untimed session on a calendar day (append). */
export async function nextDaySortOrderForDate(
  db: DbClient,
  athleteId: string,
  scheduledDate: Date | string,
  excludeSessionId?: string
): Promise<number> {
  const date =
    typeof scheduledDate === "string" ? parseDateKey(scheduledDate) : scheduledDate;
  const agg = await db.plannedSession.aggregate({
    where: {
      athleteId,
      scheduledDate: date,
      scheduledTimeMinutes: null,
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    },
    _max: { daySortOrder: true },
  });
  return (agg._max.daySortOrder ?? -1) + 1;
}

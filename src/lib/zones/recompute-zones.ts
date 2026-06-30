import type { Discipline } from "@prisma/client";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { computeActivityZones } from "@/lib/zones/process-activity";

const BATCH_SIZE = 50;

export async function findActivityIdsInDateRange(
  athleteId: string,
  discipline: Discipline,
  from: Date,
  to?: Date | null
): Promise<string[]> {
  const rows = await db.syncedActivity.findMany({
    where: {
      athleteId,
      discipline,
      startTime: {
        gte: from,
        ...(to ? { lt: to } : {}),
      },
    },
    select: { id: true },
    orderBy: { startTime: "asc" },
  });
  return rows.map((r) => r.id);
}

export async function recomputeZonesForDateRange(
  athleteId: string,
  discipline: Discipline,
  from: Date,
  to?: Date | null
): Promise<void> {
  await inngest.send({
    name: "activity/zones.recompute-range",
    data: { athleteId, discipline, from: from.toISOString(), to: to?.toISOString() ?? null },
  });
}

export async function recomputeZonesForDateRangeSync(
  athleteId: string,
  discipline: Discipline,
  from: Date,
  to?: Date | null
): Promise<number> {
  const ids = await findActivityIdsInDateRange(athleteId, discipline, from, to);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((id) => computeActivityZones(id)));
  }
  return ids.length;
}

export async function recomputeAfterPreferenceChange(
  athleteId: string,
  discipline: Discipline,
  from: Date,
  to: Date | null
): Promise<void> {
  await recomputeZonesForDateRange(athleteId, discipline, from, to);
}

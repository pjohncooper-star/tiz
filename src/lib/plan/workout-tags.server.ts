import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeWorkoutTags, type NormalizedWorkoutTag } from "@/lib/plan/workout-tags";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Upsert catalog rows for tags the athlete has used (idempotent). */
export async function upsertAthleteWorkoutTags(
  db: DbClient,
  athleteId: string,
  tags: readonly NormalizedWorkoutTag[]
): Promise<void> {
  if (tags.length === 0) return;
  await Promise.all(
    tags.map((tag) =>
      db.athleteWorkoutTag.upsert({
        where: {
          athleteId_name: { athleteId, name: tag.name },
        },
        create: {
          athleteId,
          name: tag.name,
          label: tag.label,
        },
        update: {},
      })
    )
  );
}

/** Normalize input tags, upsert catalog, return names for PlannedSession.tags. */
export async function syncSessionWorkoutTags(
  db: DbClient,
  athleteId: string,
  rawTags: readonly string[]
): Promise<string[]> {
  const tags = normalizeWorkoutTags(rawTags);
  await upsertAthleteWorkoutTags(db, athleteId, tags);
  return tags.map((t) => t.name);
}

/** Map stored tag names to display labels from the athlete catalog. */
export async function resolveWorkoutTagLabels(
  db: DbClient,
  athleteId: string,
  names: readonly string[]
): Promise<string[]> {
  if (names.length === 0) return [];
  const rows = await db.athleteWorkoutTag.findMany({
    where: { athleteId, name: { in: [...names] } },
    select: { name: true, label: true },
  });
  const labelByName = new Map(rows.map((r) => [r.name, r.label]));
  return names.map((name) => labelByName.get(name) ?? name);
}

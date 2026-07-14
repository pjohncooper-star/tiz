/**
 * Backfill ECO scores for activities that already have zone data / streams.
 *
 * Usage: npx tsx scripts/backfill-eco.ts [athleteId]
 */
import { db } from "../src/lib/db";
import { computeActivityZones } from "../src/lib/zones/process-activity";

async function main() {
  const athleteId = process.argv[2];
  const where = athleteId
    ? { athleteId, OR: [{ ecoComputed: false }, { ecos: null }] }
    : { OR: [{ ecoComputed: false }, { ecos: null }] };

  const ids = await db.syncedActivity.findMany({
    where,
    select: { id: true },
    orderBy: { startTime: "asc" },
  });

  console.log(`Recomputing zones+ECO for ${ids.length} activities…`);
  let done = 0;
  for (const row of ids) {
    await computeActivityZones(row.id);
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${ids.length}`);
  }
  console.log(`Done (${done}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

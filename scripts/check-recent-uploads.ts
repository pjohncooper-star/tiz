import { db } from "@/lib/db";
import { parseStoredStreams } from "@/lib/zones/process-activity";
import { dayQualityFromFitSelfEval } from "@/lib/survey/fit-self-eval";

async function main() {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recent = await db.syncedActivity.findMany({
    where: { createdAt: { gte: since }, discipline: "RUN" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      surveyResponse: true,
      rawStreams: true,
    },
  });

  for (const a of recent) {
    const meta = parseStoredStreams(a.rawStreams)?.meta;
    const expected = dayQualityFromFitSelfEval(meta?.workoutFeel, meta?.workoutRpe);
    console.log({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt.toISOString(),
      feel: meta?.workoutFeel,
      rpeRaw: meta?.workoutRpe,
      surveyRpe: a.surveyResponse?.rpe,
      surveyFeel: a.surveyResponse?.freshness,
      storedFlag: a.surveyResponse?.dayQualityFlag,
      expected,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

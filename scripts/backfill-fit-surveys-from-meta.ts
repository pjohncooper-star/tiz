import { db } from "@/lib/db";
import { upsertFitSelfEvalSurvey } from "@/lib/survey/fit-self-eval";
import { parseStoredStreams } from "@/lib/zones/process-activity";

/** Backfill SurveyResponse rows from workoutFeel/workoutRpe stored in rawStreams.meta. */
async function main() {
  const activities = await db.syncedActivity.findMany({
    where: { surveyResponse: null },
    select: { id: true, athleteId: true, rawStreams: true },
  });

  let updated = 0;
  for (const activity of activities) {
    const streams = parseStoredStreams(activity.rawStreams);
    const feel = streams?.meta?.workoutFeel;
    const rpe = streams?.meta?.workoutRpe;
    if (feel == null && !rpe) continue;

    await upsertFitSelfEvalSurvey(activity.athleteId, activity.id, {
      workoutFeel: feel,
      workoutRpeRaw: rpe,
    });
    updated++;
  }

  console.log(`Backfilled ${updated} survey responses from stream meta`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

import { db } from "@/lib/db";
import {
  dayQualityFromRpe,
  dayQualityFromWorkoutFeel,
  mapFitSelfEvalToSurveyFields,
} from "@/lib/survey/fit-self-eval";
import { parseStoredStreams } from "@/lib/zones/process-activity";

async function main() {
  const runs = await db.syncedActivity.findMany({
    where: {
      discipline: "RUN",
      startTime: {
        gte: new Date("2026-06-25T00:00:00Z"),
        lt: new Date("2026-06-26T00:00:00Z"),
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      startTime: true,
      createdAt: true,
      source: true,
      rawStreams: true,
      surveyResponse: true,
    },
  });

  for (const a of runs) {
    const meta = parseStoredStreams(a.rawStreams)?.meta;
    const mapped = mapFitSelfEvalToSurveyFields({
      workoutFeel: meta?.workoutFeel,
      workoutRpeRaw: meta?.workoutRpe,
    });
    console.log({
      id: a.id,
      name: a.name,
      startTime: a.startTime.toISOString(),
      createdAt: a.createdAt.toISOString(),
      source: a.source,
      metaFeel: meta?.workoutFeel,
      metaRpe: meta?.workoutRpe,
      survey: a.surveyResponse
        ? {
            rpe: a.surveyResponse.rpe,
            freshness: a.surveyResponse.freshness,
            dayQualityFlag: a.surveyResponse.dayQualityFlag,
          }
        : null,
      mapped,
      fromFeel:
        meta?.workoutFeel != null
          ? dayQualityFromWorkoutFeel(meta.workoutFeel)
          : null,
      fromRpe:
        meta?.workoutRpe != null && meta.workoutRpe > 0
          ? dayQualityFromRpe(Math.min(10, Math.max(1, Math.round(meta.workoutRpe / 10))))
          : null,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

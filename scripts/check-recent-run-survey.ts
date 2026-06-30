import { db } from "@/lib/db";
import {
  dayQualityFromRpe,
  dayQualityFromWorkoutFeel,
  mapFitSelfEvalToSurveyFields,
} from "@/lib/survey/fit-self-eval";
import { parseStoredStreams } from "@/lib/zones/process-activity";

async function main() {
  const recent = await db.syncedActivity.findMany({
    where: { discipline: "RUN", source: "BULK_IMPORT" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      createdAt: true,
      surveyResponse: {
        select: { rpe: true, freshness: true, dayQualityFlag: true },
      },
      rawStreams: true,
    },
  });

  for (const a of recent) {
    const meta = parseStoredStreams(a.rawStreams)?.meta;
    const feel = meta?.workoutFeel;
    const rpeRaw = meta?.workoutRpe;
    const mapped =
      feel || rpeRaw
        ? mapFitSelfEvalToSurveyFields({
            workoutFeel: feel,
            workoutRpeRaw: rpeRaw,
          })
        : null;
    const fromFeel = feel != null ? dayQualityFromWorkoutFeel(feel) : null;
    const fromRpe =
      rpeRaw != null && rpeRaw > 0
        ? dayQualityFromRpe(Math.min(10, Math.max(1, Math.round(rpeRaw / 10))))
        : null;

    console.log({
      name: a.name,
      feel,
      rpeRaw,
      stored: a.surveyResponse?.dayQualityFlag,
      mapped: mapped?.dayQualityFlag,
      fromFeel,
      fromRpe,
      minWouldBe:
        fromFeel && fromRpe
          ? rank(fromFeel) < rank(fromRpe)
            ? fromFeel
            : fromRpe
          : fromFeel ?? fromRpe,
    });
  }
}

const RANK = { BAD: 0, ROUGH: 1, GOOD: 2, GREAT: 3 } as const;
function rank(flag: keyof typeof RANK) {
  return RANK[flag];
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

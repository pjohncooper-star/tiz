import { db } from "@/lib/db";
import {
  dayQualityFromRpe,
  dayQualityFromWorkoutFeel,
  parseRpeFromFit,
} from "@/lib/survey/fit-self-eval";
import type { DayQualityFlag } from "@prisma/client";

const RANK: Record<DayQualityFlag, number> = {
  BAD: 0,
  ROUGH: 1,
  GOOD: 2,
  GREAT: 3,
};

function worstDayQuality(...flags: (DayQualityFlag | null | undefined)[]): DayQualityFlag | null {
  const present = flags.filter((f): f is DayQualityFlag => f != null);
  if (present.length === 0) return null;
  return present.reduce((worst, flag) => (RANK[flag] < RANK[worst] ? flag : worst));
}

async function main() {
  const surveys = await db.surveyResponse.findMany({
    where: {
      source: "FIT_IMPORT",
      OR: [{ freshness: { not: null } }, { rpe: { not: null } }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      dayQualityFlag: true,
      freshness: true,
      rpe: true,
      activity: { select: { name: true, createdAt: true } },
    },
  });

  for (const s of surveys) {
    const fromFeel =
      s.freshness != null ? dayQualityFromWorkoutFeel(s.freshness) : null;
    const fromRpe = s.rpe != null ? dayQualityFromRpe(s.rpe) : null;
    const expected = worstDayQuality(fromFeel, fromRpe);
    if (s.dayQualityFlag !== expected) {
      console.log("MISMATCH", {
        name: s.activity?.name,
        feel: s.freshness,
        rpe: s.rpe,
        stored: s.dayQualityFlag,
        fromFeel,
        fromRpe,
        expected,
      });
    }
  }

  console.log("Checked", surveys.length, "recent FIT surveys");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

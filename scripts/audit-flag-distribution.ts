import { db } from "@/lib/db";
import { effectiveDayQuality } from "@/lib/survey/fit-self-eval";

const email = process.argv[2] ?? "pjohncooper@gmail.com";

async function main() {
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { athlete: true },
  });
  if (!user?.athlete) throw new Error("No athlete");

  const flagged = await db.surveyResponse.findMany({
    where: {
      athleteId: user.athlete.id,
      source: { in: ["HISTORICAL_BACKFILL", "FIT_IMPORT"] },
      OR: [
        { dayQualityFlag: { in: ["GREAT", "GOOD", "ROUGH", "BAD"] } },
        { rpe: { not: null } },
      ],
    },
    include: { activity: { select: { discipline: true, name: true, startTime: true } } },
  });

  const byFlag: Record<string, number> = {};
  const byResolved: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byDiscipline: Record<string, Record<string, number>> = {};

  for (const f of flagged) {
    const flag = f.dayQualityFlag ?? "none";
    byFlag[flag] = (byFlag[flag] ?? 0) + 1;
    bySource[f.source] = (bySource[f.source] ?? 0) + 1;

    const resolved = effectiveDayQuality(f.dayQualityFlag, f.rpe) ?? "unresolved";
    byResolved[resolved] = (byResolved[resolved] ?? 0) + 1;

    const disc = f.activity?.discipline ?? "unknown";
    if (!byDiscipline[disc]) byDiscipline[disc] = {};
    byDiscipline[disc][resolved] = (byDiscipline[disc][resolved] ?? 0) + 1;
  }

  const insights = await db.interactionInsight.findMany({
    where: { athleteId: user.athlete.id, tier: "V0" },
    orderBy: { generatedAt: "desc" },
    take: 5,
  });

  console.log(JSON.stringify({
    email,
    totalFlagged: flagged.length,
    byDayQualityFlag: byFlag,
    byResolvedQuality: byResolved,
    bySource,
    byDisciplineResolved: byDiscipline,
    goodOrGreat: (byResolved.GREAT ?? 0) + (byResolved.GOOD ?? 0),
    roughOrBad: (byResolved.ROUGH ?? 0) + (byResolved.BAD ?? 0),
    recentInsights: insights.map((i) => ({
      headline: i.headline,
      triggerPattern: i.triggerPattern,
      confidenceNote: i.confidenceNote,
    })),
  }, null, 2));
}

main().finally(() => db.$disconnect());

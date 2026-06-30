import { db } from "@/lib/db";
import { parseStoredStreams } from "@/lib/zones/process-activity";

const email = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];

async function main() {
  const user = email
    ? await db.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        include: { athlete: true },
      })
    : null;

  if (!user?.athlete) {
    console.error("Athlete not found", email ?? "(pass --email=)");
    process.exit(1);
  }

  const athleteId = user.athlete.id;
  const total = await db.syncedActivity.count({ where: { athleteId } });

  const surveys = await db.surveyResponse.findMany({
    where: { athleteId },
    select: {
      source: true,
      rpe: true,
      freshness: true,
      dayQualityFlag: true,
    },
  });

  const fitImport = surveys.filter((s) => s.source === "FIT_IMPORT");
  const withRpe = surveys.filter((s) => s.rpe != null);
  const withFeel = surveys.filter((s) => s.freshness != null);
  const withBoth = surveys.filter((s) => s.rpe != null && s.freshness != null);

  const activities = await db.syncedActivity.findMany({
    where: { athleteId },
    select: { rawStreams: true },
  });

  let metaFeel = 0;
  let metaRpe = 0;
  let metaBoth = 0;
  for (const a of activities) {
    const meta = parseStoredStreams(a.rawStreams)?.meta;
    const feel = meta?.workoutFeel;
    const rpe = meta?.workoutRpe;
    if (feel) metaFeel++;
    if (rpe) metaRpe++;
    if (feel && rpe) metaBoth++;
  }

  console.log(JSON.stringify({
    email: user.email,
    totalActivities: total,
    surveyResponses: surveys.length,
    fitImportSurveys: fitImport.length,
    surveysWithRpe: withRpe.length,
    surveysWithFeel: withFeel.length,
    surveysWithBoth: withBoth.length,
    streamMetaWithFeel: metaFeel,
    streamMetaWithRpe: metaRpe,
    streamMetaWithBoth: metaBoth,
    pctWithSelfEval: total > 0 ? Math.round((withBoth.length / total) * 1000) / 10 : 0,
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

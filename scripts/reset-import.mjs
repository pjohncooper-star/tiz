import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import fs from "fs/promises";
import path from "path";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const IMPORT_ROOT = path.join(process.cwd(), ".data", "imports");

async function cleanupImport(jobId) {
  await fs.rm(path.join(IMPORT_ROOT, jobId), { recursive: true, force: true });
}

async function resetImportData(athleteId, onboardingStep) {
  const jobs = await db.importJob.findMany({
    where: { athleteId },
    select: { id: true },
  });

  for (const job of jobs) {
    await cleanupImport(job.id).catch(() => {});
  }

  const activityIds = (
    await db.syncedActivity.findMany({
      where: { athleteId },
      select: { id: true },
    })
  ).map((a) => a.id);

  let zoneBreakdowns = 0;
  const BATCH = 500;
  for (let i = 0; i < activityIds.length; i += BATCH) {
    const ids = activityIds.slice(i, i + BATCH);
    const result = await db.zoneBreakdown.deleteMany({
      where: { activityId: { in: ids } },
    });
    zoneBreakdowns += result.count;
  }

  let activities = 0;
  for (let i = 0; i < activityIds.length; i += BATCH) {
    const ids = activityIds.slice(i, i + BATCH);
    const result = await db.syncedActivity.deleteMany({
      where: { id: { in: ids } },
    });
    activities += result.count;
  }

  const surveys = await db.surveyResponse.deleteMany({ where: { athleteId } });
  const insights = await db.interactionInsight.deleteMany({ where: { athleteId } });
  const importJobs = await db.importJob.deleteMany({ where: { athleteId } });
  const strava = await db.stravaConnection.deleteMany({ where: { athleteId } });

  if (onboardingStep) {
    await db.athlete.update({
      where: { id: athleteId },
      data: { onboardingStep },
    });
  }

  return {
    activities,
    zoneBreakdowns,
    surveys: surveys.count,
    insights: insights.count,
    importJobs: importJobs.count,
    strava: strava.count,
    stagedJobs: jobs.length,
    onboardingStep,
  };
}

const emailArg = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];

const athletes = await db.athlete.findMany({
  include: { user: { select: { email: true, name: true } } },
});

const target = emailArg
  ? athletes.find((a) => a.user.email?.toLowerCase() === emailArg.toLowerCase())
  : athletes.length === 1
    ? athletes[0]
    : null;

if (!target) {
  console.error(
    "Could not pick an athlete. Pass --email=user@example.com\n\nAccounts:",
    athletes.map((a) => `- ${a.user.email} (${a.user.name ?? "no name"})`).join("\n")
  );
  process.exit(1);
}

const result = await resetImportData(target.id, "IMPORT");

console.log(
  `Reset ${target.user.email}: removed ${result.activities} activities, ${result.importJobs} import jobs, ${result.surveys} day flags, ${result.insights} insights; onboarding → IMPORT`
);

await db.$disconnect();

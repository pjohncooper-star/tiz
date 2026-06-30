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

const email = process.argv[2] ?? "pjohncooper@gmail.com";

const athlete = await db.athlete.findFirst({
  where: { user: { email } },
  include: {
    importJobs: { orderBy: { createdAt: "desc" }, take: 1 },
  },
});

if (!athlete?.importJobs[0]) {
  console.error("No import job found for", email);
  process.exit(1);
}

const job = athlete.importJobs[0];
const importDir = path.join(process.cwd(), ".data", "imports", job.id);

await fs.rm(importDir, { recursive: true, force: true }).catch(() => {});

await db.importJob.update({
  where: { id: job.id },
  data: {
    status: "COMPLETE",
    completedAt: new Date(),
  },
});

await db.athlete.update({
  where: { id: athlete.id },
  data: { onboardingStep: "STRAVA" },
});

const pendingZones = await db.syncedActivity.count({
  where: { athleteId: athlete.id, zoneComputed: false },
});

console.log(
  `Finalized job ${job.id}: ${job.processedFiles}/${job.totalFiles} files parsed, ${pendingZones} activities still computing zones in background`
);

await db.$disconnect();

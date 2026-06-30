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
    importJobs: { orderBy: { createdAt: "desc" }, take: 3 },
    user: { select: { email: true } },
  },
});

if (!athlete) {
  console.error("No athlete for", email);
  process.exit(1);
}

console.log("email:", athlete.user.email);
console.log("onboarding:", athlete.onboardingStep);
console.log("jobs:", JSON.stringify(athlete.importJobs, null, 2));

const activityCount = await db.syncedActivity.count({
  where: { athleteId: athlete.id },
});
console.log("activities:", activityCount);

const job = athlete.importJobs[0];
if (job) {
  const dir = path.join(process.cwd(), ".data", "imports", job.id);
  try {
    const files = await fs.readdir(dir);
    console.log("staged files:", files.length);
    const manifest = JSON.parse(
      await fs.readFile(path.join(dir, "manifest.json"), "utf8")
    );
    console.log("manifest count:", manifest.length);
  } catch (e) {
    console.log("staging dir:", e instanceof Error ? e.message : e);
  }
}

const pending = await db.syncedActivity.count({
  where: { athleteId: athlete.id, zoneComputed: false },
});
const computed = activityCount - pending;
console.log("zones:", { computed, pending, total: activityCount });

await db.$disconnect();

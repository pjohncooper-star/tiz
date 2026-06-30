import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const a = await db.syncedActivity.findUnique({
  where: { id: "cmqph4ves00178w98iug0hv77" },
  include: {
    athlete: { include: { disciplineSettings: true, thresholdProfiles: true } },
  },
});

const swimSettings = a?.athlete.disciplineSettings.find((s) => s.discipline === "SWIM");
const swimThresholds = a?.athlete.thresholdProfiles.filter((t) => t.discipline === "SWIM");

console.log(
  JSON.stringify(
    {
      swimSettings,
      swimThresholds: swimThresholds?.map((t) => ({
        signal: t.signalType,
        threshold: t.thresholdValue,
        effectiveDate: t.effectiveDate,
      })),
    },
    null,
    2
  )
);

await db.$disconnect();

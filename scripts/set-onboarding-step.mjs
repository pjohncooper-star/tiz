import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const db = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});

const email = process.argv[2] ?? "pjohncooper@gmail.com";
const step = process.argv[3] ?? "DAY_FLAGS";

const user = await db.user.findUnique({
  where: { email },
  include: { athlete: true },
});

if (!user?.athlete) {
  console.error("No athlete found for", email);
  process.exit(1);
}

const athlete = await db.athlete.update({
  where: { id: user.athlete.id },
  data: { onboardingStep: step },
});

console.log(`onboarding -> ${athlete.onboardingStep} for ${email}`);
console.log("Go to /onboarding/day-flags after refreshing the app");

await db.$disconnect();

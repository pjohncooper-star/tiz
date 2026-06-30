import { db } from "@/lib/db";

const email = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1];
if (!email) {
  console.error("Usage: npx tsx scripts/promote-rough-to-bad.ts --email=user@example.com");
  process.exit(1);
}

async function main() {
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { athlete: true },
  });
  if (!user?.athlete) {
    console.error("Athlete not found");
    process.exit(1);
  }

  const result = await db.surveyResponse.updateMany({
    where: {
      athleteId: user.athlete.id,
      dayQualityFlag: "ROUGH",
    },
    data: { dayQualityFlag: "BAD" },
  });

  const counts = await db.surveyResponse.groupBy({
    by: ["dayQualityFlag"],
    where: { athleteId: user.athlete.id },
    _count: true,
  });

  console.log(`Updated ${result.count} ROUGH → BAD for ${user.email}`);
  console.log(
    "Current flags:",
    Object.fromEntries(
      counts.map((c) => [c.dayQualityFlag ?? "null", c._count])
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

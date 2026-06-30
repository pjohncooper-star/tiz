import { db } from "@/lib/db";

const email = process.argv[2] ?? "pjohncooper@gmail.com";

async function main() {
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { athlete: true },
  });
  console.log(JSON.stringify({
    email: user?.email,
    athleteId: user?.athlete?.id,
    onboardingStep: user?.athlete?.onboardingStep,
  }, null, 2));
}

main().finally(() => db.$disconnect());

import { db } from "@/lib/db";
import { setOnboardingStep } from "@/lib/onboarding";

const email = process.argv[2] ?? "pjohncooper@gmail.com";

async function main() {
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { athlete: true },
  });
  if (!user?.athlete) {
    console.error("No athlete for", email);
    process.exit(1);
  }
  const before = user.athlete.onboardingStep;
  await setOnboardingStep(user.athlete.id, "COMPLETE");
  console.log(`${email}: ${before} → COMPLETE`);
}

main().finally(() => db.$disconnect());

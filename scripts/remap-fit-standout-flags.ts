import { db } from "@/lib/db";
import { remapFitSurveyStandoutFlags } from "@/lib/survey/fit-self-eval";

async function main() {
  const updated = await remapFitSurveyStandoutFlags();
  console.log(`Remapped ${updated} FIT survey standout flags`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

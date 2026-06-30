import { db } from "@/lib/db";
import { getSignalingGateStatus } from "@/lib/signaling/gates";
import { effectiveDayQuality } from "@/lib/survey/fit-self-eval";
import { INSIGHT_SENSITIVITY } from "@/lib/signaling/sensitivity";
import {
  OUTCOME_DISCIPLINES,
  overextendedRateDebug,
  TRIGGER_DISCIPLINES,
  TRIGGER_ZONES,
} from "@/lib/signaling/preceding-load";
import {
  DEFAULT_LOOKBACK_WINDOW_HOURS,
  isLookbackWindowHours,
} from "@/lib/signaling/lookback-window";

const email = process.argv.find((a) => a.startsWith("--email="))?.split("=")[1] ?? "pjohncooper@gmail.com";
const hoursArg = Number(process.argv.find((a) => a.startsWith("--hours="))?.split("=")[1]);
const lookbackHours =
  Number.isFinite(hoursArg) && isLookbackWindowHours(hoursArg)
    ? hoursArg
    : DEFAULT_LOOKBACK_WINDOW_HOURS;

async function main() {
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { athlete: true },
  });
  if (!user?.athlete) throw new Error("Athlete not found");
  const athleteId = user.athlete.id;

  const gate = await getSignalingGateStatus(athleteId);
  console.log("Gate:", gate);
  console.log(`Preceding workout window: ${lookbackHours}h`);

  const flagged = await db.surveyResponse.findMany({
    where: {
      athleteId,
      source: { in: ["HISTORICAL_BACKFILL", "FIT_IMPORT"] },
      OR: [
        { dayQualityFlag: { in: ["GREAT", "GOOD", "ROUGH", "BAD"] } },
        { rpe: { not: null } },
      ],
    },
    include: { activity: true },
  });

  const withQuality = flagged
    .map((f) => ({
      ...f,
      resolvedQuality: effectiveDayQuality(f.dayQualityFlag, f.rpe),
    }))
    .filter((f) => f.resolvedQuality != null);

  const good = withQuality.filter(
    (f) => f.resolvedQuality === "GREAT" || f.resolvedQuality === "GOOD"
  );
  const bad = withQuality.filter(
    (f) => f.resolvedQuality === "ROUGH" || f.resolvedQuality === "BAD"
  );

  const allActivities = await db.syncedActivity.findMany({
    where: { athleteId, zoneComputed: true },
    include: { zoneBreakdowns: { where: { isCanonical: true } } },
    orderBy: { startTime: "asc" },
  });

  const config = INSIGHT_SENSITIVITY.exploratory;
  console.log({ good: good.length, bad: bad.length });

  for (const outcomeDisc of OUTCOME_DISCIPLINES) {
    const badOutcomes = bad.filter((b) => b.activity?.discipline === outcomeDisc);
    const goodOutcomes = good.filter((g) => g.activity?.discipline === outcomeDisc);
    for (const triggerDisc of TRIGGER_DISCIPLINES) {
      for (const zone of TRIGGER_ZONES) {
        const badR = overextendedRateDebug(
          badOutcomes,
          allActivities,
          triggerDisc,
          zone,
          config,
          lookbackHours
        );
        const goodR = overextendedRateDebug(
          goodOutcomes,
          allActivities,
          triggerDisc,
          zone,
          config,
          lookbackHours
        );
        const delta = badR.rate - goodR.rate;
        const match =
          badR.rate > 0 &&
          (goodR.rate <= 0
            ? badR.rate >= config.rateDelta
            : delta >= config.rateDelta);
        console.log(
          `${outcomeDisc}<-${triggerDisc} Z${zone}: bad=${badR.rate.toFixed(3)} (${badR.over}/${badR.total}, insuff=${badR.insufficient}) good=${goodR.rate.toFixed(3)} (${goodR.over}/${goodR.total}) delta=${delta.toFixed(3)} match=${match}`
        );
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

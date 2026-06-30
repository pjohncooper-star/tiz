import { db } from "@/lib/db";
import { getSignalingGateStatus } from "./gates";
import {
  lightLoadRateForPrecedingWorkouts,
  OUTCOME_DISCIPLINES,
  overextendedRateForPrecedingWorkouts,
  TRIGGER_DISCIPLINES,
  TRIGGER_ZONES,
  type ActivityWithZones,
} from "./preceding-load";
import {
  DEFAULT_LOOKBACK_WINDOW_HOURS,
  type LookbackWindowHours,
} from "./lookback-window";
import { effectiveDayQuality } from "@/lib/survey/fit-self-eval";
import { SIGNALING_ACTIVATION_MONTHS } from "@/lib/onboarding";
import {
  DEFAULT_INSIGHT_SENSITIVITY,
  INSIGHT_SENSITIVITY,
  type InsightSensitivity,
  type InsightSensitivityConfig,
} from "./sensitivity";

export type InsightSignalPolarity = "risk" | "protective";

export type V0InsightDraft = {
  headline: string;
  triggerPattern: string;
  outcomePattern: string;
  sampleSize: number;
  confidenceNote: string;
  polarity: InsightSignalPolarity;
};

export type V0InsightOptions = {
  sensitivity?: InsightSensitivity;
  lookbackHours?: LookbackWindowHours;
};

export type V0InsightGenerationResult = {
  insights: V0InsightDraft[];
  riskCount: number;
  protectiveCount: number;
  gateActivated: boolean;
  goodCount: number;
  badCount: number;
  sensitivity: InsightSensitivity;
  lookbackHours: LookbackWindowHours;
  message: string;
};

const MAX_INSIGHTS_PER_POLARITY = 3;

export function insightPolarityFromOutcome(outcomePattern: string): InsightSignalPolarity {
  return outcomePattern.endsWith("_good_or_great") ? "protective" : "risk";
}

function resultMessage(
  insights: V0InsightDraft[],
  gateActivated: boolean,
  goodCount: number,
  badCount: number,
  config: InsightSensitivityConfig,
  lookbackHours: LookbackWindowHours
): string {
  if (!gateActivated) {
    return `Workout Signaling needs at least ${SIGNALING_ACTIVATION_MONTHS} months of zone-computed history.`;
  }
  if (goodCount < config.minGood || badCount < config.minBad) {
    return `Need at least ${config.minGood} good/great and ${config.minBad} rough/bad flagged workouts (currently ${goodCount} good, ${badCount} rough/bad).`;
  }
  if (insights.length === 0) {
    return `No risk or protective patterns met the ${config.label.toLowerCase()} threshold within ${lookbackHours}h. Try a longer lookback, exploratory sensitivity, or flag more workouts.`;
  }

  const riskCount = insights.filter((i) => i.polarity === "risk").length;
  const protectiveCount = insights.filter((i) => i.polarity === "protective").length;
  const parts: string[] = [];
  if (riskCount > 0) {
    parts.push(`${riskCount} risk signal${riskCount === 1 ? "" : "s"}`);
  }
  if (protectiveCount > 0) {
    parts.push(`${protectiveCount} protective signal${protectiveCount === 1 ? "" : "s"}`);
  }
  return `Generated ${parts.join(" and ")} (${config.label.toLowerCase()} sensitivity, ${lookbackHours}h lookback).`;
}

function patternMatchesRisk(
  badRate: number,
  goodRate: number,
  config: InsightSensitivityConfig
): boolean {
  if (badRate <= 0) return false;
  if (goodRate <= 0) return badRate >= config.rateDelta;
  return badRate >= goodRate + config.rateDelta;
}

function patternMatchesProtective(
  goodRate: number,
  badRate: number,
  config: InsightSensitivityConfig
): boolean {
  if (goodRate <= 0) return false;
  if (badRate <= 0) return goodRate >= config.rateDelta;
  return goodRate >= badRate + config.rateDelta;
}

function triggerLabel(discipline: string): string {
  return discipline.toLowerCase();
}

function sportPhrase(triggerDisc: string, outcomeDisc: string): string {
  return triggerDisc === outcomeDisc
    ? `another ${triggerLabel(triggerDisc)}`
    : `a ${triggerLabel(triggerDisc)}`;
}

async function loadActivitiesWithZones(athleteId: string): Promise<ActivityWithZones[]> {
  return db.syncedActivity.findMany({
    where: { athleteId, zoneComputed: true },
    include: { zoneBreakdowns: { where: { isCanonical: true } } },
    orderBy: { startTime: "asc" },
  });
}

export async function generateV0Insights(
  athleteId: string,
  options: V0InsightOptions = {}
): Promise<V0InsightGenerationResult> {
  const sensitivity = options.sensitivity ?? DEFAULT_INSIGHT_SENSITIVITY;
  const lookbackHours = options.lookbackHours ?? DEFAULT_LOOKBACK_WINDOW_HOURS;
  const config = INSIGHT_SENSITIVITY[sensitivity];
  const gate = await getSignalingGateStatus(athleteId);
  if (!gate.activated) {
    return {
      insights: [],
      riskCount: 0,
      protectiveCount: 0,
      gateActivated: false,
      goodCount: 0,
      badCount: 0,
      sensitivity,
      lookbackHours,
      message: resultMessage([], false, 0, 0, config, lookbackHours),
    };
  }

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

  if (good.length < config.minGood || bad.length < config.minBad) {
    return {
      insights: [],
      riskCount: 0,
      protectiveCount: 0,
      gateActivated: true,
      goodCount: good.length,
      badCount: bad.length,
      sensitivity,
      lookbackHours,
      message: resultMessage([], true, good.length, bad.length, config, lookbackHours),
    };
  }

  const allActivities = await loadActivitiesWithZones(athleteId);
  const riskInsights: V0InsightDraft[] = [];
  const protectiveInsights: V0InsightDraft[] = [];

  for (const outcomeDisc of OUTCOME_DISCIPLINES) {
    const badOutcomes = bad.filter((b) => b.activity?.discipline === outcomeDisc);
    const goodOutcomes = good.filter((g) => g.activity?.discipline === outcomeDisc);
    if (badOutcomes.length < config.minBad || goodOutcomes.length < config.minGood) {
      continue;
    }

    const outcome = triggerLabel(outcomeDisc);
    const comparisonNote = `Compared ${badOutcomes.length} rough/bad vs ${goodOutcomes.length} good/great ${outcome} workouts. Trigger: 1st–3rd preceding workouts within ${lookbackHours}h (${config.label.toLowerCase()} sensitivity, ${Math.round(config.rateDelta * 100)}%+ rate gap).`;

    for (const triggerDisc of TRIGGER_DISCIPLINES) {
      const trigger = sportPhrase(triggerDisc, outcomeDisc);
      for (const zone of TRIGGER_ZONES) {
        const badOverextendedRate = overextendedRateForPrecedingWorkouts(
          badOutcomes,
          allActivities,
          triggerDisc,
          zone,
          config,
          lookbackHours
        );
        const goodOverextendedRate = overextendedRateForPrecedingWorkouts(
          goodOutcomes,
          allActivities,
          triggerDisc,
          zone,
          config,
          lookbackHours
        );
        if (patternMatchesRisk(badOverextendedRate, goodOverextendedRate, config)) {
          riskInsights.push({
            polarity: "risk",
            headline: `Rough/bad ${outcome} workouts were more often preceded within ${lookbackHours}h by ${trigger} workout with overextended Z${zone} than good ${outcome} workouts.`,
            triggerPattern: `${triggerDisc}_Z${zone}_overextended_prev1-3_${lookbackHours}h`,
            outcomePattern: `${outcomeDisc}_rough_or_bad`,
            sampleSize: badOutcomes.length + goodOutcomes.length,
            confidenceNote: comparisonNote,
          });
        }

        const goodLightRate = lightLoadRateForPrecedingWorkouts(
          goodOutcomes,
          allActivities,
          triggerDisc,
          zone,
          config,
          lookbackHours
        );
        const badLightRate = lightLoadRateForPrecedingWorkouts(
          badOutcomes,
          allActivities,
          triggerDisc,
          zone,
          config,
          lookbackHours
        );
        if (patternMatchesProtective(goodLightRate, badLightRate, config)) {
          protectiveInsights.push({
            polarity: "protective",
            headline: `Good/great ${outcome} workouts were more often preceded within ${lookbackHours}h by ${trigger} workout with light Z${zone} load than rough/bad ${outcome} workouts.`,
            triggerPattern: `${triggerDisc}_Z${zone}_light_prev1-3_${lookbackHours}h`,
            outcomePattern: `${outcomeDisc}_good_or_great`,
            sampleSize: badOutcomes.length + goodOutcomes.length,
            confidenceNote: comparisonNote,
          });
        }
      }
    }
  }

  riskInsights.sort((a, b) => b.sampleSize - a.sampleSize);
  protectiveInsights.sort((a, b) => b.sampleSize - a.sampleSize);
  const topInsights = [
    ...riskInsights.slice(0, MAX_INSIGHTS_PER_POLARITY),
    ...protectiveInsights.slice(0, MAX_INSIGHTS_PER_POLARITY),
  ];

  for (const insight of topInsights) {
    await db.interactionInsight.create({
      data: {
        athleteId,
        tier: "V0",
        headline: insight.headline,
        triggerPattern: insight.triggerPattern,
        outcomePattern: insight.outcomePattern,
        sampleSize: insight.sampleSize,
        confidenceNote: insight.confidenceNote,
      },
    });
  }

  const riskCount = topInsights.filter((i) => i.polarity === "risk").length;
  const protectiveCount = topInsights.filter((i) => i.polarity === "protective").length;

  return {
    insights: topInsights,
    riskCount,
    protectiveCount,
    gateActivated: true,
    goodCount: good.length,
    badCount: bad.length,
    sensitivity,
    lookbackHours,
    message: resultMessage(topInsights, true, good.length, bad.length, config, lookbackHours),
  };
}

export async function regenerateV0Insights(
  athleteId: string,
  options: V0InsightOptions = {}
): Promise<V0InsightGenerationResult> {
  await db.interactionInsight.deleteMany({ where: { athleteId, tier: "V0" } });
  return generateV0Insights(athleteId, options);
}

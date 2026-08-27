import { inngest } from "@/inngest/client";
import { processImportBatch } from "@/lib/import/process-batch";
import { refreshTrainerRoadCalendarForAthlete } from "@/lib/plan/trainerroad/sync";
import { recomputeZonesForDateRangeSync } from "@/lib/zones/recompute-zones";
import { computeActivityZones } from "@/lib/zones/process-activity";
import { regenerateV0Insights } from "@/lib/signaling/v0";
import { syncStravaActivity } from "@/lib/strava/sync";

export const processImportBatchFn = inngest.createFunction(
  {
    id: "process-import-batch",
    triggers: [{ event: "import/batch.process" }],
  },
  async ({ event }) => {
    const { jobId } = event.data as { jobId: string };
    await processImportBatch(jobId);
  }
);

export const computeZonesFn = inngest.createFunction(
  {
    id: "compute-activity-zones",
    triggers: [{ event: "activity/zones.compute" }],
  },
  async ({ event }) => {
    const { activityId } = event.data as { activityId: string };
    await computeActivityZones(activityId);
  }
);

export const recomputeZonesRangeFn = inngest.createFunction(
  {
    id: "recompute-zones-range",
    triggers: [{ event: "activity/zones.recompute-range" }],
  },
  async ({ event }) => {
    const { athleteId, discipline, from, to } = event.data as {
      athleteId: string;
      discipline: "BIKE" | "RUN" | "SWIM" | "STRENGTH";
      from: string;
      to: string | null;
    };
    await recomputeZonesForDateRangeSync(
      athleteId,
      discipline,
      new Date(from),
      to ? new Date(to) : null
    );
  }
);

export const generateInsightsFn = inngest.createFunction(
  {
    id: "generate-v0-insights",
    triggers: [{ event: "signaling/v0.generate" }],
  },
  async ({ event }) => {
    const { athleteId } = event.data as { athleteId: string };
    await regenerateV0Insights(athleteId);
  }
);

export const syncStravaFn = inngest.createFunction(
  {
    id: "sync-strava-activity",
    triggers: [{ event: "strava/activity.sync" }],
  },
  async ({ event }) => {
    const { athleteId, stravaActivityId } = event.data as {
      athleteId: string;
      stravaActivityId: number;
    };
    await syncStravaActivity(athleteId, stravaActivityId);
  }
);

export const refreshTrainerRoadCalendarFn = inngest.createFunction(
  {
    id: "refresh-trainerroad-calendar",
    debounce: {
      key: "event.data.athleteId",
      period: "30m",
    },
    triggers: [{ event: "trainerroad/calendar.refresh" }],
  },
  async ({ event }) => {
    const { athleteId } = event.data as { athleteId: string };
    await refreshTrainerRoadCalendarForAthlete(athleteId);
  }
);

export const inngestFunctions = [
  processImportBatchFn,
  computeZonesFn,
  recomputeZonesRangeFn,
  generateInsightsFn,
  syncStravaFn,
  refreshTrainerRoadCalendarFn,
];

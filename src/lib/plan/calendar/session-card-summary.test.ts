import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActivityCardMetrics,
  buildSessionCardMetrics,
  formatActivityCardMetricLines,
  formatCardDistance,
  formatCardDuration,
  formatSessionCardMetricComparison,
  formatSessionCardMetricLines,
  isRedundantCalendarActivityTitle,
} from "@/lib/plan/calendar/session-card-summary";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";

function baseSession(
  overrides: Partial<CalendarPlannedSession> = {}
): CalendarPlannedSession {
  return {
    id: "s1",
    scheduledDate: "2026-07-01",
    discipline: "SWIM",
    title: "Swim",
    totalMinutes: 45,
    plannedMinutes: 45,
    distanceMeters: 2743,
    zoneMinutes: {},
    stepCount: 0,
    metricsSummary: "3000 yd",
    zoneAllocationMissing: false,
    source: "FLEXIBLE",
    poolSize: "SCY",
    multisportGroupId: null,
    sessionIndex: null,
    estimatedDurationMinutes: null,
    linkedActivity: null,
    hasCompletedOverride: false,
    completedDurationMinutes: null,
    completedDistanceMeters: null,
    completedTargetSpeedMps: null,
    completedTargetPaceSeconds: null,
    completedZones: null,
    workoutProfile: null,
    sessionRole: "MODERATE",
    displaySessionRole: "MODERATE",
    tizSignalOverride: null,
    poolSlotKind: null,
    ...overrides,
  };
}

const linkedActivity = {
  id: "a1",
  name: "Morning swim",
  startTime: "2026-07-01T07:02:00.000Z",
  durationSeconds: 3720,
  elapsedSeconds: 3720,
  movingSeconds: null,
  distanceMeters: 3200,
  zoneMinutes: 0,
  discipline: "SWIM",
  legType: null,
};

describe("formatCardDuration", () => {
  it("formats durations at or below 60 minutes as minutes", () => {
    assert.equal(formatCardDuration(45), "45m");
    assert.equal(formatCardDuration(60), "60m");
  });

  it("formats durations above 60 minutes as h:mm", () => {
    assert.equal(formatCardDuration(61), "1:01");
    assert.equal(formatCardDuration(62), "1:02");
    assert.equal(formatCardDuration(90), "1:30");
  });
});

describe("formatCardDistance", () => {
  it("uses full units when they fit on the card", () => {
    assert.equal(formatCardDistance(800, "SWIM", "METRIC"), "800m");
    assert.equal(formatCardDistance(1200, "SWIM", "METRIC"), "1200m");
    assert.equal(formatCardDistance(8000, "RUN", "METRIC"), "8000m");
  });

  it("uses k suffix only when full units are too long", () => {
    assert.equal(formatCardDistance(2743, "SWIM", "IMPERIAL"), "3k");
    assert.equal(formatCardDistance(10000, "RUN", "METRIC"), "10k");
  });
});

describe("isRedundantCalendarActivityTitle", () => {
  it("treats discipline-only and date-suffixed names as redundant", () => {
    assert.equal(isRedundantCalendarActivityTitle("Bike", "BIKE"), true);
    assert.equal(isRedundantCalendarActivityTitle("Bike Jun 29", "BIKE"), true);
    assert.equal(isRedundantCalendarActivityTitle("Pool Swim (lap swimming)", "SWIM"), true);
  });

  it("keeps custom activity names", () => {
    assert.equal(isRedundantCalendarActivityTitle("Morning Ride", "BIKE"), false);
  });
});

describe("buildSessionCardMetrics", () => {
  it("splits planned and completed values for linked sessions", () => {
    const metrics = buildSessionCardMetrics(baseSession({ linkedActivity }), "IMPERIAL");
    assert.deepEqual(metrics.duration, { planned: "45m", completed: "1:02" });
    assert.deepEqual(metrics.distance, { planned: "3k", completed: "3.5k" });
    assert.equal(metrics.hasAny, true);
  });

  it("returns planned-only rows for unlinked sessions", () => {
    const metrics = buildSessionCardMetrics(baseSession(), "IMPERIAL");
    assert.deepEqual(metrics.duration, { planned: "45m", completed: null });
    assert.deepEqual(metrics.distance, { planned: "3k", completed: null });
  });

  it("returns hasAny false when no metrics exist", () => {
    const metrics = buildSessionCardMetrics(
      baseSession({ plannedMinutes: 0, distanceMeters: null }),
      "IMPERIAL"
    );
    assert.equal(metrics.hasAny, false);
  });
});

describe("buildActivityCardMetrics", () => {
  it("returns completed-only duration and distance", () => {
    const metrics = buildActivityCardMetrics(
      { discipline: "RUN", durationSeconds: 2700, distanceMeters: 8000 },
      "METRIC"
    );
    assert.equal(metrics.duration, "45m");
    assert.equal(metrics.distance, "8000m");
    assert.equal(metrics.hasAny, true);
  });
});

describe("session card summary", () => {
  it("formats unlinked planned session as a single compact metric line", () => {
    assert.deepEqual(formatSessionCardMetricLines(baseSession(), "IMPERIAL"), ["45m|3k"]);
  });

  it("formats linked session duration and distance comparisons on one line", () => {
    const lines = formatSessionCardMetricLines(
      baseSession({ linkedActivity }),
      "IMPERIAL"
    );
    assert.deepEqual(lines, ["45m→1:02|3k→3.5k"]);
  });

  it("compares duration and distance in metric comparison helpers", () => {
    const comparison = formatSessionCardMetricComparison(
      baseSession({ linkedActivity }),
      "IMPERIAL"
    );
    assert.equal(comparison.duration, "45m→1:02");
    assert.equal(comparison.distance, "3k→3.5k");
  });

  it("prefers moving seconds for completed duration", () => {
    const comparison = formatSessionCardMetricComparison(
      baseSession({
        linkedActivity: { ...linkedActivity, movingSeconds: 3600, durationSeconds: 3720 },
      }),
      "IMPERIAL"
    );
    assert.equal(comparison.duration, "45m→60m");
  });

  it("respects completed duration override", () => {
    const comparison = formatSessionCardMetricComparison(
      baseSession({
        linkedActivity,
        completedDurationMinutes: 50,
      }),
      "IMPERIAL"
    );
    assert.equal(comparison.duration, "45m→50m");
  });

  it("respects completed distance override", () => {
    const comparison = formatSessionCardMetricComparison(
      baseSession({
        linkedActivity,
        completedDistanceMeters: 2743,
      }),
      "IMPERIAL"
    );
    assert.equal(comparison.distance, "3k→3k");
  });

  it("shows completed-only metrics when planned values are missing", () => {
    const comparison = formatSessionCardMetricComparison(
      baseSession({
        plannedMinutes: 0,
        distanceMeters: null,
        linkedActivity,
      }),
      "IMPERIAL"
    );
    assert.equal(comparison.duration, "1:02");
    assert.equal(comparison.distance, "3.5k");
  });

  it("returns no metric lines for empty planned sessions", () => {
    assert.deepEqual(
      formatSessionCardMetricLines(
        baseSession({ plannedMinutes: 0, distanceMeters: null }),
        "IMPERIAL"
      ),
      []
    );
  });

  it("formats unlinked activity card metrics without time of day", () => {
    assert.deepEqual(
      formatActivityCardMetricLines(
        {
          discipline: "RUN",
          durationSeconds: 2700,
          distanceMeters: 8000,
        },
        "METRIC"
      ),
      ["45m|8000m"]
    );
  });
});

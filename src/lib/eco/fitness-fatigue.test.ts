import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityLocalDateKey, eachDateKey } from "@/lib/dates";
import {
  buildDailyLoadByDiscipline,
  buildWeeklyLoadByDiscipline,
  computeFitnessFatigue,
  computeFitnessFatigueWeekly,
  DEFAULT_TAU1,
  DEFAULT_TAU2,
} from "@/lib/eco/fitness-fatigue";
import { utcOffsetSecondsFromFitMessages } from "@/lib/import/fit";

describe("activityLocalDateKey", () => {
  it("falls back to UTC calendar day when offset is missing", () => {
    // Sunday 13:00 UTC → Sunday
    const start = new Date("2026-01-11T13:00:00.000Z");
    assert.equal(activityLocalDateKey(start, null), "2026-01-11");
    assert.equal(activityLocalDateKey(start, undefined), "2026-01-11");
  });

  it("assigns Australia morning swim to Monday local when UTC is still Sunday (AEDT +11)", () => {
    // Monday 08:00 AEDT = Sunday 21:00 UTC
    const start = new Date("2026-01-11T21:00:00.000Z");
    const offset = 11 * 3600;
    assert.equal(activityLocalDateKey(start, null), "2026-01-11"); // UTC Sunday
    assert.equal(activityLocalDateKey(start, offset), "2026-01-12"); // Monday local
  });
});

describe("utcOffsetSecondsFromFitMessages", () => {
  it("returns local − utc in seconds", () => {
    const utc = new Date("2026-01-11T21:00:00.000Z");
    const local = new Date("2026-01-12T08:00:00.000Z");
    const offset = utcOffsetSecondsFromFitMessages({
      activityMesgs: [{ timestamp: utc, localTimestamp: local }],
    });
    assert.equal(offset, 11 * 3600);
  });

  it("returns null when timestamps are incomplete", () => {
    assert.equal(utcOffsetSecondsFromFitMessages({}), null);
    assert.equal(
      utcOffsetSecondsFromFitMessages({
        activityMesgs: [{ timestamp: new Date() }],
      }),
      null
    );
  });
});

describe("buildDailyLoadByDiscipline", () => {
  it("sums ECOs by local day and sport; ignores strength", () => {
    const daily = buildDailyLoadByDiscipline([
      {
        startTime: new Date("2026-01-11T21:00:00.000Z"),
        utcOffsetSeconds: 11 * 3600,
        discipline: "SWIM",
        ecos: 40,
      },
      {
        startTime: new Date("2026-01-12T10:00:00.000Z"),
        utcOffsetSeconds: 0,
        discipline: "BIKE",
        ecos: 100,
      },
      {
        startTime: new Date("2026-01-12T12:00:00.000Z"),
        discipline: "STRENGTH",
        ecos: 50,
      },
    ]);
    assert.equal(daily.get("2026-01-12")?.SWIM, 40);
    assert.equal(daily.get("2026-01-12")?.BIKE, 100);
    assert.equal(daily.has("2026-01-11"), false);
  });
});

describe("computeFitnessFatigue", () => {
  it("applies same-day impulse then decays with zero load", () => {
    const series = computeFitnessFatigue(
      [
        {
          startTime: new Date("2026-03-01T12:00:00.000Z"),
          utcOffsetSeconds: 0,
          discipline: "RUN",
          ecos: 100,
        },
      ],
      { to: "2026-03-03" }
    );
    assert.equal(series.length, 3);
    assert.equal(series[0]!.date, "2026-03-01");
    assert.equal(series[0]!.run.w, 100);
    assert.equal(series[0]!.run.g, 100);
    assert.equal(series[0]!.run.h, 100);
    assert.equal(series[0]!.run.form, 0);
    assert.equal(series[0]!.form, 0);

    const g1 = 100 * Math.exp(-1 / DEFAULT_TAU1);
    const h1 = 100 * Math.exp(-1 / DEFAULT_TAU2);
    assert.ok(Math.abs(series[1]!.run.g - g1) < 1e-9);
    assert.ok(Math.abs(series[1]!.run.h - h1) < 1e-9);
    assert.ok(series[1]!.run.form > 0); // fatigue decays faster → positive form next day
    assert.equal(series[1]!.run.w, 0);
  });

  it("keeps separate swim/bike/run state and sums form", () => {
    const series = computeFitnessFatigue(
      [
        {
          startTime: new Date("2026-03-01T12:00:00.000Z"),
          utcOffsetSeconds: 0,
          discipline: "SWIM",
          ecos: 30,
        },
        {
          startTime: new Date("2026-03-01T14:00:00.000Z"),
          utcOffsetSeconds: 0,
          discipline: "BIKE",
          ecos: 60,
        },
      ],
      { to: "2026-03-01" }
    );
    assert.equal(series[0]!.swim.w, 30);
    assert.equal(series[0]!.bike.w, 60);
    assert.equal(series[0]!.run.w, 0);
    assert.equal(series[0]!.form, 0);
  });

  it("hand-worked 2-day equal daily load asymptote direction", () => {
    const impulses = eachDateKey("2026-04-01", "2026-04-02").map((date) => ({
      startTime: new Date(`${date}T12:00:00.000Z`),
      utcOffsetSeconds: 0,
      discipline: "RUN" as const,
      ecos: 50,
    }));
    const series = computeFitnessFatigue(impulses);
    assert.equal(series.length, 2);
    assert.equal(series[0]!.run.g, 50);
    const g1 = 50 * Math.exp(-1 / DEFAULT_TAU1) + 50;
    const h1 = 50 * Math.exp(-1 / DEFAULT_TAU2) + 50;
    assert.ok(Math.abs(series[1]!.run.g - g1) < 1e-9);
    assert.ok(Math.abs(series[1]!.run.h - h1) < 1e-9);
    assert.ok(series[1]!.run.form > 0);
  });

  it("buckets travel activity onto local Monday for IR impulses", () => {
    const series = computeFitnessFatigue(
      [
        {
          // Monday 08:00 AEDT = Sunday 21:00 UTC
          startTime: new Date("2026-01-11T21:00:00.000Z"),
          utcOffsetSeconds: 11 * 3600,
          discipline: "SWIM",
          ecos: 25,
        },
      ],
      { from: "2026-01-11", to: "2026-01-12" }
    );
    const sun = series.find((p) => p.date === "2026-01-11");
    const mon = series.find((p) => p.date === "2026-01-12");
    assert.equal(sun?.swim.w ?? 0, 0);
    assert.equal(mon?.swim.w, 25);
  });
});

describe("computeFitnessFatigueWeekly", () => {
  it("buckets two mid-week activities into one Monday w", () => {
    // Wed + Fri of week starting Mon 2026-06-08
    const weekly = buildWeeklyLoadByDiscipline([
      {
        startTime: new Date("2026-06-10T12:00:00.000Z"),
        utcOffsetSeconds: 0,
        discipline: "RUN",
        ecos: 40,
      },
      {
        startTime: new Date("2026-06-12T12:00:00.000Z"),
        utcOffsetSeconds: 0,
        discipline: "RUN",
        ecos: 60,
      },
    ]);
    assert.equal(weekly.size, 1);
    assert.equal(weekly.get("2026-06-08")?.RUN, 100);
  });

  it("decays with e^(-7/τ) between weekly steps", () => {
    const series = computeFitnessFatigueWeekly(
      [
        {
          startTime: new Date("2026-06-01T12:00:00.000Z"), // Mon
          utcOffsetSeconds: 0,
          discipline: "RUN",
          ecos: 100,
        },
      ],
      { to: "2026-06-15" } // through week of Jun 15
    );
    assert.equal(series[0]!.date, "2026-06-01");
    assert.equal(series[0]!.run.g, 100);
    const g1 = 100 * Math.exp(-7 / DEFAULT_TAU1);
    const h1 = 100 * Math.exp(-7 / DEFAULT_TAU2);
    assert.equal(series[1]!.date, "2026-06-08");
    assert.ok(Math.abs(series[1]!.run.g - g1) < 1e-9);
    assert.ok(Math.abs(series[1]!.run.h - h1) < 1e-9);
    assert.equal(series[1]!.run.w, 0);
  });

  it("aligns season week impulse to a single Monday series point", () => {
    const series = computeFitnessFatigueWeekly(
      [
        {
          startTime: new Date("2026-06-15T12:00:00.000Z"),
          utcOffsetSeconds: 0,
          discipline: "RUN",
          ecos: 180,
        },
      ],
      { from: "2026-06-08", to: "2026-06-22" }
    );
    // Series warm-starts at first impulse week (Jun 15), not before.
    assert.deepEqual(
      series.map((p) => p.date),
      ["2026-06-15", "2026-06-22"]
    );
    assert.equal(series[0]!.run.w, 180);
    assert.equal(series[1]!.run.w, 0);
  });
});

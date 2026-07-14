import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { zoneKey } from "@/lib/workout/steps";
import { ecoZoneScore } from "@/lib/eco/scores";
import {
  mapTizMinutesToEcoZones,
  projectedEcosFromPlannedTiZ,
  tizMinutesForDiscipline,
} from "@/lib/eco/tiz-to-eco";
import { plannedEcoImpulses } from "@/lib/eco/hybrid-impulses";
import { computeFitnessFatigue } from "@/lib/eco/fitness-fatigue";

describe("tiz-to-eco", () => {
  it("splits Z1 across ECO 1–2", () => {
    const eco = mapTizMinutesToEcoZones({ 1: 40, 2: 0, 3: 0, 4: 0, 5: 0 });
    assert.equal(eco[1], 20);
    assert.equal(eco[2], 20);
    assert.equal(eco[3], 0);
  });

  it("maps a flat Z2 run hour to ECO zone 3 × run factor", () => {
    const projected = projectedEcosFromPlannedTiZ({
      discipline: "RUN",
      targetZones: { "2": 60 },
    });
    assert.ok(projected);
    assert.equal(projected!.ecos, 60 * ecoZoneScore(3) * 1);
  });

  it("applies bike factor 0.5", () => {
    const projected = projectedEcosFromPlannedTiZ({
      discipline: "BIKE",
      targetZones: { "2": 60 },
    });
    assert.ok(projected);
    assert.equal(projected!.ecos, 60 * ecoZoneScore(3) * 0.5);
  });

  it("returns null when zone allocation is missing", () => {
    assert.equal(
      projectedEcosFromPlannedTiZ({
        discipline: "RUN",
        durationHintMinutes: 60,
        zoneAllocationMissing: true,
      }),
      null
    );
  });

  it("reads discipline-keyed zone minutes", () => {
    const tiz = tizMinutesForDiscipline("SWIM", {
      [zoneKey("SWIM", 1)]: 10,
      [zoneKey("SWIM", 3)]: 20,
    });
    assert.equal(tiz[1], 10);
    assert.equal(tiz[3], 20);
  });
});

describe("plannedEcoImpulses", () => {
  it("projects future sessions and skips past + today-with-actual", () => {
    const impulses = plannedEcoImpulses({
      todayKey: "2026-06-10",
      sessions: [
        {
          id: "past",
          scheduledDate: new Date("2026-06-09T00:00:00.000Z"),
          discipline: "RUN",
          targetZones: { "2": 30 },
        },
        {
          id: "today-done",
          scheduledDate: new Date("2026-06-10T00:00:00.000Z"),
          discipline: "BIKE",
          targetZones: { "2": 60 },
          linkedActivityHasEcos: true,
        },
        {
          id: "future",
          scheduledDate: new Date("2026-06-12T00:00:00.000Z"),
          discipline: "RUN",
          targetZones: { "2": 40 },
        },
      ],
    });
    assert.equal(impulses.length, 1);
    assert.equal(impulses[0]!.discipline, "RUN");
    assert.equal(impulses[0]!.ecos, 40 * ecoZoneScore(3));
  });

  it("feeds hybrid IR so future planned load bumps form after today", () => {
    const history = [
      {
        startTime: new Date("2026-06-01T12:00:00.000Z"),
        utcOffsetSeconds: 0,
        discipline: "RUN",
        ecos: 100,
      },
    ];
    const planned = plannedEcoImpulses({
      todayKey: "2026-06-10",
      sessions: [
        {
          id: "f1",
          scheduledDate: new Date("2026-06-15T00:00:00.000Z"),
          discipline: "RUN",
          targetZones: { "2": 60 },
        },
      ],
    });
    const series = computeFitnessFatigue([...history, ...planned], {
      from: "2026-06-10",
      to: "2026-06-16",
    });
    const before = series.find((p) => p.date === "2026-06-14");
    const onLoad = series.find((p) => p.date === "2026-06-15");
    assert.ok(before && onLoad);
    assert.equal(onLoad!.run.w, 60 * ecoZoneScore(3));
    assert.ok(onLoad!.run.h > before!.run.h);
  });
});

describe("seasonWeekEcoImpulses", () => {
  it("places weekly TiZ ECO on week start for future weeks", async () => {
    const { seasonWeekEcoImpulses } = await import("@/lib/eco/hybrid-impulses");
    const { zoneKey } = await import("@/lib/workout/steps");
    const impulses = seasonWeekEcoImpulses({
      todayKey: "2026-06-10",
      weeks: [
        {
          weekStartDate: "2026-06-01",
          zoneMinutes: { [zoneKey("RUN", 2)]: 60 },
        },
        {
          weekStartDate: "2026-06-15",
          zoneMinutes: { [zoneKey("RUN", 2)]: 40 },
        },
      ],
    });
    // Past week still in range if weekEnd >= today? June 1 week ends June 7 < June 10 → skip
    assert.equal(impulses.length, 1);
    assert.equal(impulses[0]!.discipline, "RUN");
    assert.equal(impulses[0]!.ecos, 40 * ecoZoneScore(3));
  });
});

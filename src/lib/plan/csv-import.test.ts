import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseCsv,
  parsePlannedSessionsCsv,
  PLANNED_SESSIONS_CSV_HEADERS,
  PLANNED_SESSIONS_CSV_TEMPLATE,
} from "@/lib/plan/csv-import";

describe("planned sessions CSV import", () => {
  it("exposes a headers-only template", () => {
    assert.equal(
      PLANNED_SESSIONS_CSV_TEMPLATE,
      `${PLANNED_SESSIONS_CSV_HEADERS.join(",")}\n`
    );
  });

  it("parses quoted fields with commas", () => {
    const rows = parseCsv('a,b\n"hello, world",x\n');
    assert.deepEqual(rows, [
      ["a", "b"],
      ["hello, world", "x"],
    ]);
  });

  it("parses metric run and bike rows using athlete units", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-01,RUN,Easy run,45,10,5:00,steady,EASY,",
      "2026-08-02,BIKE,Endurance,90,40,28,,,",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      RUN: { displayUnit: "METRIC", poolSize: null },
      BIKE: { displayUnit: "METRIC", poolSize: null },
      SWIM: { displayUnit: "METRIC", poolSize: "SCM" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.sessions.length, 2);
    assert.equal(result.sessions[0]!.discipline, "RUN");
    assert.equal(result.sessions[0]!.distanceMeters, 10000);
    assert.equal(result.sessions[0]!.targetPaceSeconds, 300);
    assert.equal(result.sessions[0]!.estimatedDurationMinutes, 45);
    assert.equal(result.sessions[0]!.sessionRole, "EASY");

    assert.equal(result.sessions[1]!.discipline, "BIKE");
    assert.equal(result.sessions[1]!.distanceMeters, 40000);
    assert.ok(result.sessions[1]!.targetSpeedMps != null);
    assert.ok(Math.abs(result.sessions[1]!.targetSpeedMps! - 28 / 3.6) < 1e-9);
  });

  it("converts imperial run miles and swim yards from settings", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-03,RUN,Long run,90,10,8:00,,LONG,",
      "2026-08-04,SWIM,Main set,60,2000,1:30,,MODERATE,SCY",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      RUN: { displayUnit: "IMPERIAL", poolSize: null },
      BIKE: { displayUnit: "IMPERIAL", poolSize: null },
      SWIM: { displayUnit: "IMPERIAL", poolSize: "SCY" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(Math.abs(result.sessions[0]!.distanceMeters! - 16093.44) < 1e-6);
    // 8:00 /mi → sec/km
    assert.ok(Math.abs(result.sessions[0]!.targetPaceSeconds! - 480 / 1.609344) < 1e-6);

    assert.ok(Math.abs(result.sessions[1]!.distanceMeters! - 2000 * 0.9144) < 1e-6);
    // 1:30 /100yd → sec/100m
    assert.ok(Math.abs(result.sessions[1]!.targetPaceSeconds! - 90 * (100 / 91.44)) < 1e-6);
    assert.equal(result.sessions[1]!.poolSize, "SCY");
  });

  it("returns row errors without partial success", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-01,RUN,Ok,30,5,,,,",
      "not-a-date,RUN,Bad,30,5,,,,",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]!.row, 3);
  });

  it("defaults swim pool from athlete settings", () => {
    const csv = [
      "date,discipline,title,distance",
      "2026-08-05,SWIM,Aerobic,3000",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      SWIM: { displayUnit: "METRIC", poolSize: "LCM" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.sessions[0]!.poolSize, "LCM");
    assert.equal(result.sessions[0]!.distanceMeters, 3000);
    assert.equal(result.sessions[0]!.title, "Aerobic");
  });
});

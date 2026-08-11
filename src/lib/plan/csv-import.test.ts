import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseCsv,
  parsePlannedSessionsCsv,
  PLANNED_SESSIONS_CSV_HEADERS,
  PLANNED_SESSIONS_CSV_TEMPLATE,
} from "@/lib/plan/csv-import";
import { WORKOUT_TREE_VERSION } from "@/lib/workout/workout-tree";

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
      "2026-08-01,RUN,Easy run,45,10,5:00,steady,EASY,,,,,,,,,,",
      "2026-08-02,BIKE,Endurance,90,40,28,,,,,,,,,,,,,",
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
    assert.equal(result.sessions[0]!.workoutTree, null);

    assert.equal(result.sessions[1]!.discipline, "BIKE");
    assert.equal(result.sessions[1]!.distanceMeters, 40000);
    assert.ok(result.sessions[1]!.targetSpeedMps != null);
    assert.ok(Math.abs(result.sessions[1]!.targetSpeedMps! - 28 / 3.6) < 1e-9);
  });

  it("converts imperial run miles and swim yards from settings", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-03,RUN,Long run,90,10,8:00,,LONG,,,,,,,,,,",
      "2026-08-04,SWIM,Main set,60,2000,1:30,,MODERATE,SCY,,,,,,,,,",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      RUN: { displayUnit: "IMPERIAL", poolSize: null },
      BIKE: { displayUnit: "IMPERIAL", poolSize: null },
      SWIM: { displayUnit: "IMPERIAL", poolSize: "SCY" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(Math.abs(result.sessions[0]!.distanceMeters! - 16093.44) < 1e-6);
    assert.ok(Math.abs(result.sessions[0]!.targetPaceSeconds! - 480 / 1.609344) < 1e-6);

    assert.ok(Math.abs(result.sessions[1]!.distanceMeters! - 2000 * 0.9144) < 1e-6);
    assert.ok(Math.abs(result.sessions[1]!.targetPaceSeconds! - 90 * (100 / 91.44)) < 1e-6);
    assert.equal(result.sessions[1]!.poolSize, "SCY");
  });

  it("returns row errors without partial success", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-01,RUN,Ok,30,5,,,,,,,,,,,,,",
      "not-a-date,RUN,Bad,30,5,,,,,,,,,,,,,",
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

  it("builds a simplified structured workout with one-level repeats", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-04,RUN,Threshold,,,,,,,1,step,warmup,time,15,2,heart_rate,,",
      "2026-08-04,RUN,Threshold,,,,,,,2,repeat,,,,,,3,",
      "2026-08-04,RUN,Threshold,,,,,,,2.1,step,interval,time,3,4,heart_rate,,",
      "2026-08-04,RUN,Threshold,,,,,,,2.2,step,recovery,time,2,2,heart_rate,,",
      "2026-08-04,RUN,Threshold,,,,,,,3,step,cooldown,time,10,1,heart_rate,,",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      RUN: { displayUnit: "METRIC", poolSize: null },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.sessions.length, 1);
    const session = result.sessions[0]!;
    assert.equal(session.title, "Threshold");
    assert.ok(session.workoutTree);
    assert.equal(session.workoutTree!.version, WORKOUT_TREE_VERSION);
    assert.equal(session.workoutTree!.nodes.length, 3);
    assert.equal(session.workoutTree!.nodes[0]!.kind, "step");
    assert.equal(session.workoutTree!.nodes[1]!.kind, "repeat");
    assert.equal(session.workoutTree!.nodes[2]!.kind, "step");

    const repeat = session.workoutTree!.nodes[1]!;
    if (repeat.kind !== "repeat") throw new Error("expected repeat");
    assert.equal(repeat.repeatCount, 3);
    assert.equal(repeat.children.length, 2);
    assert.equal(repeat.children[0]!.kind, "step");
    if (repeat.children[0]!.kind === "step") {
      assert.equal(repeat.children[0]!.intensity, "interval");
      assert.deepEqual(repeat.children[0]!.duration, { type: "time", value: 180 });
    }

    // 15 + 3*(3+2) + 10 = 40
    assert.equal(session.estimatedDurationMinutes, 40);
  });

  it("builds nested repeats with percent-of-threshold power targets", () => {
    const csv = [
      "date,discipline,title,role,step,kind,intensity,duration_type,duration,zone,signal,repeat,target_mode,target",
      "2027-07-05,BIKE,VO2 nest,INTENSITY,1,step,warmup,time,10,1,power,,,",
      "2027-07-05,BIKE,VO2 nest,INTENSITY,2,repeat,,,,,,3,,",
      "2027-07-05,BIKE,VO2 nest,INTENSITY,2.1,repeat,,,,,,10,,",
      "2027-07-05,BIKE,VO2 nest,INTENSITY,2.1.1,step,interval,time,0.5,,power,,value,130%",
      "2027-07-05,BIKE,VO2 nest,INTENSITY,2.1.2,step,rest,time,0.5,,power,,value,20%",
      "2027-07-05,BIKE,VO2 nest,INTENSITY,2.2,step,recovery,time,5,1,power,,,",
      "2027-07-05,BIKE,VO2 nest,INTENSITY,3,step,cooldown,time,10,1,power,,,",
    ].join("\n");

    const result = parsePlannedSessionsCsv(
      csv,
      { BIKE: { displayUnit: "METRIC", poolSize: null } },
      { ftpWatts: 200 }
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const session = result.sessions[0]!;
    assert.ok(session.workoutTree);
    assert.equal(session.workoutTree!.nodes.length, 3);

    const outer = session.workoutTree!.nodes[1]!;
    if (outer.kind !== "repeat") throw new Error("expected outer repeat");
    assert.equal(outer.repeatCount, 3);
    assert.equal(outer.children.length, 2);

    const inner = outer.children[0]!;
    if (inner.kind !== "repeat") throw new Error("expected inner repeat");
    assert.equal(inner.repeatCount, 10);
    assert.equal(inner.children.length, 2);

    const hard = inner.children[0]!;
    const easy = inner.children[1]!;
    if (hard.kind !== "step" || easy.kind !== "step") throw new Error("expected steps");
    assert.deepEqual(hard.target, { signal: "power", mode: "value", value: 260 });
    assert.deepEqual(easy.target, { signal: "power", mode: "value", value: 40 });
    assert.deepEqual(hard.duration, { type: "time", value: 30 });
    assert.deepEqual(easy.duration, { type: "time", value: 30 });

    // 10 + 3*(10*(0.5+0.5)+5) + 10 = 65
    assert.equal(session.estimatedDurationMinutes, 65);
  });

  it("parses absolute power ranges and pace values", () => {
    const csv = [
      "date,discipline,title,step,kind,intensity,duration_type,duration,signal,target_mode,target_low,target_high,target",
      "2026-08-04,BIKE,Sweet spot,1,step,active,time,20,power,range,220,250,",
      "2026-08-05,RUN,Tempo,1,step,active,time,20,pace,value,,,4:30",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      BIKE: { displayUnit: "METRIC", poolSize: null },
      RUN: { displayUnit: "METRIC", poolSize: null },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const bikeStep = result.sessions[0]!.workoutTree!.nodes[0]!;
    if (bikeStep.kind !== "step") throw new Error("expected step");
    assert.deepEqual(bikeStep.target, {
      signal: "power",
      mode: "range",
      low: 220,
      high: 250,
    });

    const runStep = result.sessions[1]!.workoutTree!.nodes[0]!;
    if (runStep.kind !== "step") throw new Error("expected step");
    assert.deepEqual(runStep.target, { signal: "pace", mode: "value", value: 270 });
    assert.equal(runStep.targetPaceSeconds, 270);
  });

  it("stores relative pace refs without baking absolute seconds", () => {
    const csv = [
      "date,discipline,title,step,kind,intensity,duration_type,duration,signal,target_mode,target",
      "2027-07-09,RUN,Relative,1,step,warmup,time,10,pace,relative,threshold",
      "2027-07-09,RUN,Relative,2,step,interval,time,3,pace,relative,95%|5k",
      "2027-07-09,RUN,Relative,3,step,active,time,20,pace,relative,10k",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      RUN: { displayUnit: "METRIC", poolSize: null },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const nodes = result.sessions[0]!.workoutTree!.nodes;
    assert.equal(nodes.length, 3);
    const [wu, hard, steady] = nodes;
    if (wu!.kind !== "step" || hard!.kind !== "step" || steady!.kind !== "step") {
      throw new Error("expected steps");
    }
    assert.deepEqual(wu.target, {
      signal: "pace",
      mode: "relative",
      ref: "threshold",
    });
    assert.deepEqual(hard.target, {
      signal: "pace",
      mode: "relative",
      ref: "5k",
      pct: 95,
    });
    assert.deepEqual(steady.target, {
      signal: "pace",
      mode: "relative",
      ref: "10k",
    });
    assert.equal(wu.targetPaceSeconds, undefined);
    assert.equal(hard.targetPaceSeconds, undefined);
    assert.equal(steady.targetPaceSeconds, undefined);
  });

  it("rejects percent power targets without FTP", () => {
    const csv = [
      "date,discipline,title,step,kind,intensity,duration_type,duration,signal,target_mode,target",
      "2026-08-04,BIKE,Bad,1,step,interval,time,1,power,value,130%",
    ].join("\n");
    const result = parsePlannedSessionsCsv(csv);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((e) => /bike FTP/i.test(e.message)));
  });

  it("rejects step nesting deeper than three id segments", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-04,RUN,Bad,,,,,,,1,repeat,,,,,,2,",
      "2026-08-04,RUN,Bad,,,,,,,1.1,repeat,,,,,,2,",
      "2026-08-04,RUN,Bad,,,,,,,1.1.1,repeat,,,,,,2,",
      "2026-08-04,RUN,Bad,,,,,,,1.1.1.1,step,interval,time,1,4,,,",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.some((e) => /deeper than 3 levels/i.test(e.message)));
  });

  it("keeps skeleton and structured sessions in the same file", () => {
    const csv = [
      PLANNED_SESSIONS_CSV_HEADERS.join(","),
      "2026-08-01,RUN,Easy,45,8,,,,,,,,,,,,",
      "2026-08-02,BIKE,VO2,,,,,,,1,step,warmup,time,10,2,power,,",
      "2026-08-02,BIKE,VO2,,,,,,,2,step,interval,time,5,5,power,,",
    ].join("\n");

    const result = parsePlannedSessionsCsv(csv, {
      RUN: { displayUnit: "METRIC", poolSize: null },
      BIKE: { displayUnit: "METRIC", poolSize: null },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.sessions.length, 2);
    assert.equal(result.sessions[0]!.workoutTree, null);
    assert.ok(result.sessions[1]!.workoutTree);
    assert.equal(result.sessions[1]!.estimatedDurationMinutes, 15);
  });
});

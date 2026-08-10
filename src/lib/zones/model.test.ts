import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  LEGACY_MAX_AUTHORED_ZONE,
  ZONES,
  ZONE_BAR_COLORS,
  ZONE_COUNT,
  ZONE_CUTOFF_COUNT,
  ZONE_PILL_COLORS,
  clampZone,
  emptyZoneRecord,
  isAuthoredZoneIndex,
  isZoneNumber,
} from "@/lib/zones/model";
import { DEFAULT_ZONE_BOUNDARIES_BY_KEY } from "@/lib/zones/boundaries";

describe("zone model", () => {
  it("keeps the zone list, cutoff count, and palettes in agreement", () => {
    assert.equal(ZONES.length, ZONE_COUNT);
    assert.equal(ZONE_CUTOFF_COUNT, ZONE_COUNT - 1);
    assert.equal(Object.keys(ZONE_BAR_COLORS).length, ZONE_COUNT);
    assert.equal(Object.keys(ZONE_PILL_COLORS).length, ZONE_COUNT);
    assert.deepEqual(Object.keys(emptyZoneRecord(0)).map(Number), [...ZONES]);
  });

  it("clamps out-of-range zones into the canonical range", () => {
    assert.equal(clampZone(0), 1);
    assert.equal(clampZone(-3), 1);
    assert.equal(clampZone(3), 3);
    assert.equal(clampZone(6), ZONE_COUNT);
    assert.equal(clampZone(7), ZONE_COUNT);
    assert.equal(clampZone(Number.NaN), 1);
  });

  it("separates authored zones from the wider range read out of stored documents", () => {
    assert.ok(isZoneNumber(ZONE_COUNT));
    assert.ok(!isZoneNumber(ZONE_COUNT + 1));
    assert.ok(isAuthoredZoneIndex(LEGACY_MAX_AUTHORED_ZONE));
    assert.ok(!isAuthoredZoneIndex(LEGACY_MAX_AUTHORED_ZONE + 1));
    assert.ok(!isAuthoredZoneIndex(2.5));
  });
});

describe("default zone boundaries", () => {
  it("defines one cutoff fewer than there are zones for every discipline and signal", () => {
    for (const [key, boundaries] of Object.entries(
      DEFAULT_ZONE_BOUNDARIES_BY_KEY
    )) {
      assert.equal(
        boundaries.length,
        ZONE_CUTOFF_COUNT,
        `${key} should define ${ZONE_CUTOFF_COUNT} cutoffs, got ${boundaries.length}`
      );
    }
  });

  it("keeps every discipline's signals on the same number of zones", () => {
    // Role-based signal overrides let one discipline score easy sessions on heart
    // rate and hard ones on pace, and both land in the same weekly TiZ bucket, so
    // the signals have to agree on how many zones there are.
    const countsByDiscipline = new Map<string, Set<number>>();
    for (const [key, boundaries] of Object.entries(
      DEFAULT_ZONE_BOUNDARIES_BY_KEY
    )) {
      const discipline = key.split(":")[0]!;
      const counts = countsByDiscipline.get(discipline) ?? new Set<number>();
      counts.add(boundaries.length);
      countsByDiscipline.set(discipline, counts);
    }
    for (const [discipline, counts] of countsByDiscipline) {
      assert.equal(
        counts.size,
        1,
        `${discipline} signals disagree on zone count: ${[...counts].join(", ")}`
      );
    }
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("no re-divergence", () => {
  it("has no zone list literals outside the model", () => {
    const modelPath = path.join("src", "lib", "zones", "model.ts");
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      if (path.normalize(file) === path.normalize(modelPath)) continue;
      const text = readFileSync(file, "utf8");
      if (/\[\s*1,\s*2,\s*3,\s*4,\s*5(\s*,\s*6\s*,\s*7)?\s*\]/.test(text)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Import ZONES from @/lib/zones/model instead of re-declaring it: ${offenders.join(", ")}`
    );
  });
});

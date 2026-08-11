import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultNewSwimEquipment,
  normalizeSwimEquipmentIds,
  parseSwimEquipmentCatalog,
  seedSwimEquipmentCatalog,
  serializeSwimEquipmentCatalog,
  swimEquipmentLabels,
} from "@/lib/swim/equipment-catalog";
import { parseSwimIntervalSet, swimIntervalToRepeatBlock } from "@/lib/workout/swim-interval-set";
import { parseWorkoutTree } from "@/lib/workout/workout-tree";

describe("swim equipment catalog", () => {
  it("seeds the five default pieces of gear", () => {
    const catalog = seedSwimEquipmentCatalog();
    assert.deepEqual(
      catalog.map((e) => e.id),
      ["kickboard", "fins", "pull-buoy", "paddles", "snorkel"]
    );
  });

  it("falls back to seeds when raw is empty", () => {
    assert.equal(parseSwimEquipmentCatalog(null).length, 5);
    assert.equal(parseSwimEquipmentCatalog([]).length, 5);
  });

  it("preserves a custom list through serialize/parse", () => {
    const custom = serializeSwimEquipmentCatalog([
      { id: "fins", name: "Zoomers", sortOrder: 0 },
      { id: "snorkel", name: "Front snorkel", sortOrder: 1 },
    ]);
    const parsed = parseSwimEquipmentCatalog(custom);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]!.name, "Zoomers");
    assert.equal(parsed[1]!.id, "snorkel");
  });

  it("creates a unique id for new entries", () => {
    const catalog = seedSwimEquipmentCatalog();
    const next = defaultNewSwimEquipment(catalog);
    assert.ok(!catalog.some((e) => e.id === next.id));
  });

  it("resolves labels and keeps unknown ids visible", () => {
    const catalog = seedSwimEquipmentCatalog();
    assert.deepEqual(swimEquipmentLabels(["fins", "mystery"], catalog), [
      "Fins",
      "mystery",
    ]);
  });

  it("normalizes equipment id arrays", () => {
    assert.deepEqual(normalizeSwimEquipmentIds([" fins ", "fins", "", 3]), ["fins"]);
    assert.equal(normalizeSwimEquipmentIds("nope"), undefined);
    assert.equal(normalizeSwimEquipmentIds([]), undefined);
  });
});

describe("equipment on workout steps", () => {
  it("round-trips equipment on a leaf step and swim interval set", () => {
    const parsed = parseWorkoutTree({
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "interval",
          duration: { type: "distance", value: 100 },
          target: { signal: "pace", mode: "zone", zone: 4 },
          notes: "strong kick",
          equipment: ["kickboard", "fins"],
        },
        {
          kind: "swim_interval",
          repeatCount: 8,
          distanceMeters: 100,
          restMode: "fixed",
          fixedRestSeconds: 20,
          target: { signal: "pace", mode: "zone", zone: 4 },
          notes: "pull set",
          equipment: ["pull-buoy", "paddles"],
        },
      ],
    });
    const leaf = parsed.nodes[0]!;
    const set = parsed.nodes[1]!;
    if (leaf.kind !== "step" || set.kind !== "swim_interval") {
      throw new Error("unexpected nodes");
    }
    assert.equal(leaf.notes, "strong kick");
    assert.deepEqual(leaf.equipment, ["kickboard", "fins"]);
    assert.equal(set.notes, "pull set");
    assert.deepEqual(set.equipment, ["pull-buoy", "paddles"]);
  });

  it("copies equipment onto the work leaf when expanding a swim interval", () => {
    const set = parseSwimIntervalSet({
      kind: "swim_interval",
      repeatCount: 4,
      distanceMeters: 50,
      restMode: "fixed",
      fixedRestSeconds: 15,
      target: { signal: "pace", mode: "zone", zone: 3 },
      equipment: ["snorkel"],
      notes: "technique",
    });
    assert.ok(set);
    const block = swimIntervalToRepeatBlock(set!);
    assert.equal(block.notes, "technique");
    const work = block.children[0]!;
    assert.equal(work.kind, "step");
    if (work.kind !== "step") return;
    assert.deepEqual(work.equipment, ["snorkel"]);
  });

  it("drops blank notes and empty equipment on parse", () => {
    const parsed = parseWorkoutTree({
      version: 2,
      nodes: [
        {
          kind: "step",
          intensity: "active",
          duration: { type: "time", value: 60 },
          target: { signal: "pace", mode: "zone", zone: 2 },
          notes: "   ",
          equipment: [],
        },
      ],
    });
    const step = parsed.nodes[0]!;
    if (step.kind !== "step") throw new Error("expected step");
    assert.equal(step.notes, undefined);
    assert.equal(step.equipment, undefined);
  });
});

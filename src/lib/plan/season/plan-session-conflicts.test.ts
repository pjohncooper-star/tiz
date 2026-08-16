import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clashIsUnresolved,
  detectPlanSessionClashes,
  isDroppedPlanSession,
  resolveClashPrefer,
} from "./plan-session-conflicts";

describe("detectPlanSessionClashes", () => {
  it("ignores the same attachment twice on one day", () => {
    const clashes = detectPlanSessionClashes([
      {
        attachmentId: "a",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 0,
        sortOrder: 0,
      },
      {
        attachmentId: "a",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 0,
        sortOrder: 1,
      },
    ]);
    assert.equal(clashes.length, 0);
  });

  it("flags two attachments on the same date and sport", () => {
    const clashes = detectPlanSessionClashes([
      {
        attachmentId: "a",
        attachmentName: "Pfitz",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 0,
        sortOrder: 0,
        title: "Easy",
      },
      {
        attachmentId: "b",
        attachmentName: "Daniels",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 2,
        sortOrder: 0,
        title: "Repeat",
      },
    ]);
    assert.equal(clashes.length, 1);
    assert.equal(clashes[0]?.discipline, "RUN");
  });
});

describe("resolveClashPrefer", () => {
  it("drops the non-preferred session", () => {
    const clash = detectPlanSessionClashes([
      {
        attachmentId: "a",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 0,
        sortOrder: 0,
      },
      {
        attachmentId: "b",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 1,
        sortOrder: 0,
      },
    ])[0]!;
    const next = resolveClashPrefer(clash, "a", []);
    assert.equal(isDroppedPlanSession(next, "b", 1, 0), true);
    assert.equal(isDroppedPlanSession(next, "a", 0, 0), false);
  });

  it("records keep-both so the clash is no longer unresolved", () => {
    const clash = detectPlanSessionClashes([
      {
        attachmentId: "a",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 0,
        sortOrder: 0,
      },
      {
        attachmentId: "b",
        scheduledDateKey: "2026-08-04",
        discipline: "RUN",
        dayOffset: 1,
        sortOrder: 0,
      },
    ])[0]!;
    assert.equal(clashIsUnresolved(clash, []), true);
    const next = resolveClashPrefer(clash, "both", []);
    assert.equal(isDroppedPlanSession(next, "a", 0, 0), false);
    assert.equal(isDroppedPlanSession(next, "b", 1, 0), false);
    assert.equal(clashIsUnresolved(clash, next), false);
  });
});

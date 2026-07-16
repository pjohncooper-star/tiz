import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionRoleForChip } from "./session-role-for-chip";

describe("sessionRoleForChip", () => {
  it("maps slot kinds to session roles", () => {
    assert.equal(
      sessionRoleForChip({
        id: "x",
        discipline: "BIKE",
        label: "Bike · Intense",
        slotKind: "INTENSITY",
      }),
      "INTENSITY"
    );
    assert.equal(
      sessionRoleForChip({
        id: "x",
        discipline: "RUN",
        label: "Run · Long",
        slotKind: "LONG",
      }),
      "LONG"
    );
    assert.equal(
      sessionRoleForChip({
        id: "x",
        discipline: "RUN",
        label: "Run · Endurance",
        slotKind: "SUBSTITUTE_ENDURANCE",
      }),
      "MODERATE"
    );
  });
});

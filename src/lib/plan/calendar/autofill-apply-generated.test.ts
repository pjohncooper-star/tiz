import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generatedPoolCardId,
  generatedSessionDraftEntries,
} from "@/lib/plan/calendar/generated-pool-cards";

describe("generatedSessionDraftEntries", () => {
  it("keeps generated session keys and drops pool chip ids", () => {
    const drafts = {
      "chip-endurance-1": { durationMinutes: 30 },
      [generatedPoolCardId("session-abc")]: { durationMinutes: 60 },
    };
    assert.deepEqual(generatedSessionDraftEntries(drafts), [
      {
        cardId: generatedPoolCardId("session-abc"),
        sessionId: "session-abc",
        draft: { durationMinutes: 60 },
      },
    ]);
  });
});

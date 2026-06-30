import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Discipline } from "@prisma/client";
import {
  pickFirstAutoLinkCandidate,
  resolveAutoLinkDateKey,
} from "./session-link";

type SessionCandidate = {
  id: string;
  discipline: Discipline;
  linkedActivityId: string | null;
  scheduledDateKey: string;
};

function filterUnlinkedCandidates(
  sessions: SessionCandidate[],
  discipline: Discipline,
  dateKey: string
) {
  return sessions.filter(
    (s) =>
      s.discipline === discipline &&
      s.linkedActivityId === null &&
      s.scheduledDateKey === dateKey
  );
}

describe("resolveAutoLinkDateKey", () => {
  it("uses activity start time when no override", () => {
    const start = new Date("2026-06-20T14:30:00");
    assert.equal(resolveAutoLinkDateKey(start), "2026-06-20");
  });

  it("uses matchDateKey override when provided", () => {
    const start = new Date("2026-06-19T23:00:00");
    assert.equal(resolveAutoLinkDateKey(start, "2026-06-20"), "2026-06-20");
  });
});

describe("pickFirstAutoLinkCandidate", () => {
  it("returns null when no candidates", () => {
    assert.equal(pickFirstAutoLinkCandidate([]), null);
  });

  it("picks lowest id when multiple sessions match", () => {
    const picked = pickFirstAutoLinkCandidate([
      { id: "session_b" },
      { id: "session_a" },
      { id: "session_c" },
    ]);
    assert.equal(picked?.id, "session_a");
  });
});

describe("auto-link candidate selection", () => {
  const dateKey = "2026-06-20";
  const swim: Discipline = "SWIM";
  const run: Discipline = "RUN";

  it("selects a single unlinked swim on the same day", () => {
    const sessions: SessionCandidate[] = [
      {
        id: "swim_1",
        discipline: swim,
        linkedActivityId: null,
        scheduledDateKey: dateKey,
      },
    ];
    const candidates = filterUnlinkedCandidates(sessions, swim, dateKey);
    assert.equal(pickFirstAutoLinkCandidate(candidates)?.id, "swim_1");
  });

  it("returns no candidate when no planned session exists", () => {
    const candidates = filterUnlinkedCandidates([], swim, dateKey);
    assert.equal(pickFirstAutoLinkCandidate(candidates), null);
  });

  it("skips wrong discipline", () => {
    const sessions: SessionCandidate[] = [
      {
        id: "run_1",
        discipline: run,
        linkedActivityId: null,
        scheduledDateKey: dateKey,
      },
    ];
    const candidates = filterUnlinkedCandidates(sessions, swim, dateKey);
    assert.equal(pickFirstAutoLinkCandidate(candidates), null);
  });

  it("skips already-linked sessions and picks next unlinked", () => {
    const sessions: SessionCandidate[] = [
      {
        id: "swim_linked",
        discipline: swim,
        linkedActivityId: "activity_old",
        scheduledDateKey: dateKey,
      },
      {
        id: "swim_open",
        discipline: swim,
        linkedActivityId: null,
        scheduledDateKey: dateKey,
      },
    ];
    const candidates = filterUnlinkedCandidates(sessions, swim, dateKey);
    assert.equal(pickFirstAutoLinkCandidate(candidates)?.id, "swim_open");
  });

  it("picks earliest id among two unlinked swims", () => {
    const sessions: SessionCandidate[] = [
      {
        id: "swim_second",
        discipline: swim,
        linkedActivityId: null,
        scheduledDateKey: dateKey,
      },
      {
        id: "swim_first",
        discipline: swim,
        linkedActivityId: null,
        scheduledDateKey: dateKey,
      },
    ];
    const candidates = filterUnlinkedCandidates(sessions, swim, dateKey);
    assert.equal(pickFirstAutoLinkCandidate(candidates)?.id, "swim_first");
  });

  it("uses matchDateKey override for day filtering", () => {
    const sessions: SessionCandidate[] = [
      {
        id: "swim_planned",
        discipline: swim,
        linkedActivityId: null,
        scheduledDateKey: "2026-06-20",
      },
    ];
    const activityDay = "2026-06-19";
    const overrideDay = "2026-06-20";
    const withoutOverride = filterUnlinkedCandidates(sessions, swim, activityDay);
    assert.equal(pickFirstAutoLinkCandidate(withoutOverride), null);

    const withOverride = filterUnlinkedCandidates(sessions, swim, overrideDay);
    assert.equal(pickFirstAutoLinkCandidate(withOverride)?.id, "swim_planned");
  });
});

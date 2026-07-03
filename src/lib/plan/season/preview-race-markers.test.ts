import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDateKey } from "@/lib/dates";
import { buildPreviewRaceMarkers } from "./preview-race-markers";

describe("preview-race-markers", () => {
  const seasonStart = parseDateKey("2025-01-13");

  it("builds markers for A/B/C races with name and duration tooltip", () => {
    const markers = buildPreviewRaceMarkers(
      seasonStart,
      12,
      {
        name: "Marathon",
        date: "2025-03-15",
        disciplines: ["RUN"],
        estimatedDurationMinutes: 180,
      },
      [
        {
          name: "Half tune-up",
          date: "2025-02-08",
          disciplines: ["RUN"],
          estimatedDurationMinutes: 90,
        },
      ],
      [
        {
          name: "Park run",
          date: "2025-01-25",
          disciplines: ["RUN"],
          estimatedDurationMinutes: 25,
        },
      ]
    );

    assert.equal(markers.length, 3);
    assert.deepEqual(
      markers.map((m) => m.priority),
      ["A", "B", "C"]
    );
    assert.match(markers[0]!.tooltip, /Marathon/);
    assert.match(markers[0]!.tooltip, /3:00:00/);
    assert.match(markers[1]!.tooltip, /Half tune-up/);
    assert.match(markers[2]!.tooltip, /Park run/);
  });

  it("skips races without date or name", () => {
    const markers = buildPreviewRaceMarkers(
      seasonStart,
      8,
      { name: "", date: "2025-02-01", disciplines: ["RUN"] },
      [{ name: "B race", date: "", disciplines: ["RUN"] }],
      []
    );
    assert.equal(markers.length, 0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMesocyclesFromExplicitDefinitions,
  resolveMesocycles,
  splitAllPhasesIntoMesocycles,
} from "./phase-split";

const basePhase = {
  name: "Base",
  sortOrder: 0,
  weekCount: 8,
  phaseKind: "BASE" as const,
  focusMode: "PHASE" as const,
  phaseFocus: "AEROBIC_BASE" as const,
  swimSessionsPerWeek: 3,
  bikeSessionsPerWeek: 4,
  runSessionsPerWeek: 3,
};

describe("mesocycle resolution", () => {
  it("uses explicit mesocycle definitions when valid", () => {
    const phases = [
      {
        ...basePhase,
        mesocycles: [
          { name: "Base I", weekCount: 3 },
          { name: "Base II", weekCount: 5 },
        ],
      },
    ];
    const mesocycles = buildMesocyclesFromExplicitDefinitions(phases);
    assert.equal(mesocycles?.length, 2);
    assert.equal(mesocycles?.[0]?.name, "Base I");
    assert.equal(mesocycles?.[0]?.endWeekIndex, 2);
    assert.equal(mesocycles?.[1]?.startWeekIndex, 3);
    assert.equal(mesocycles?.[1]?.endWeekIndex, 7);
  });

  it("falls back to auto split when mesocycle weeks do not match phase", () => {
    const phases = [
      {
        ...basePhase,
        mesocycles: [{ name: "Base I", weekCount: 3 }],
      },
    ];
    assert.equal(buildMesocyclesFromExplicitDefinitions(phases), null);
    const auto = resolveMesocycles(phases, 4);
    assert.equal(auto.length, splitAllPhasesIntoMesocycles(phases, 4).length);
  });
});

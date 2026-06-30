import type { PhaseKind } from "@prisma/client";
import type { SeasonPhaseInput } from "./types";

const PHASE_COLORS: Record<PhaseKind, string> = {
  BASE: "#38bdf8",
  BUILD: "#6366f1",
  RACE_PREP: "#f59e0b",
  TAPER: "#22c55e",
};

const DEFAULT_FOCUS: Record<PhaseKind, SeasonPhaseInput["phaseFocus"]> = {
  BASE: "AEROBIC_BASE",
  BUILD: "THRESHOLD",
  RACE_PREP: "RACE_SPECIFICITY",
  TAPER: "FRESHNESS",
};

/** Split total weeks into base / build / race prep / taper blocks. */
export function defaultPhasesForWeeks(totalWeeks: number): SeasonPhaseInput[] {
  const taper = Math.max(1, Math.round(totalWeeks * 0.1));
  const racePrep = Math.max(1, Math.round(totalWeeks * 0.15));
  const build = Math.max(2, Math.round(totalWeeks * 0.35));
  let base = totalWeeks - build - racePrep - taper;
  if (base < 2) {
    base = Math.max(1, totalWeeks - taper - racePrep - 1);
  }

  const blocks: { name: string; weekCount: number; phaseKind: PhaseKind }[] = [
    { name: "Base", weekCount: base, phaseKind: "BASE" },
    { name: "Build", weekCount: build, phaseKind: "BUILD" },
    { name: "Race prep", weekCount: racePrep, phaseKind: "RACE_PREP" },
    { name: "Taper", weekCount: taper, phaseKind: "TAPER" },
  ];

  let sortOrder = 0;
  return blocks
    .filter((b) => b.weekCount > 0)
    .map((b) => ({
      name: b.name,
      sortOrder: sortOrder++,
      weekCount: b.weekCount,
      phaseKind: b.phaseKind,
      color: PHASE_COLORS[b.phaseKind],
      focusMode: "PHASE" as const,
      phaseFocus: DEFAULT_FOCUS[b.phaseKind],
      swimSessionsPerWeek: 3,
      bikeSessionsPerWeek: 4,
      runSessionsPerWeek: 3,
    }));
}

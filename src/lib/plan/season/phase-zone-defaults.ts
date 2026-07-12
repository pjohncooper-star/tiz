import type { PhaseFocus, PhaseKind } from "@prisma/client";
import { DEFAULT_FOCUS } from "./default-phases";
import { FOCUS_TIZ_PRESETS } from "./constants";
import {
  catalogFocusLabel,
  resolveCatalogPercents,
  type ZoneFocusCatalog,
} from "./zone-focus-catalog";
import {
  PHASE_KINDS,
  TRI_PLAN_DISCIPLINES,
  type DisciplineZoneSplit,
  type PhaseKindZoneDefaults,
  type PhaseZoneSplits,
  type TriPlanDiscipline,
  type ZoneSplitPercents,
} from "./zone-split-types";

export function presetDisciplineZoneSplit(focus: PhaseFocus): DisciplineZoneSplit {
  return { mode: "preset", focus, focusId: focus };
}

export function presetDisciplineZoneSplitById(focusId: string): DisciplineZoneSplit {
  return {
    mode: "preset",
    focusId,
    focus: focusId in FOCUS_TIZ_PRESETS ? (focusId as PhaseFocus) : undefined,
  };
}

export function disciplineSplitFocusId(split: DisciplineZoneSplit): string {
  return split.focusId ?? split.focus ?? "AEROBIC_BASE";
}

export function zoneSplitsFromFocus(focus: PhaseFocus): PhaseZoneSplits {
  const split = presetDisciplineZoneSplit(focus);
  return {
    SWIM: { ...split },
    BIKE: { ...split },
    RUN: { ...split },
  };
}

export function defaultZoneSplitsForKind(kind: PhaseKind): PhaseZoneSplits {
  return zoneSplitsFromFocus(DEFAULT_FOCUS[kind] ?? "AEROBIC_BASE");
}

export function defaultPhaseKindZoneDefaults(): PhaseKindZoneDefaults {
  return PHASE_KINDS.reduce(
    (acc, kind) => {
      acc[kind] = defaultZoneSplitsForKind(kind);
      return acc;
    },
    {} as PhaseKindZoneDefaults
  );
}

export function resolvePhaseKindZoneDefaultsForNewSeason(
  explicit: PhaseKindZoneDefaults | undefined,
  athleteStored: unknown
): PhaseKindZoneDefaults {
  if (explicit !== undefined) return explicit;
  return parsePhaseKindZoneDefaults(athleteStored);
}

export function normalizeZoneSplitPercents(p: ZoneSplitPercents): ZoneSplitPercents {
  const sum = p.z1 + p.z2 + p.z3 + p.z4 + p.z5;
  if (sum <= 0) return { z1: 100, z2: 0, z3: 0, z4: 0, z5: 0 };
  return {
    z1: (p.z1 / sum) * 100,
    z2: (p.z2 / sum) * 100,
    z3: (p.z3 / sum) * 100,
    z4: (p.z4 / sum) * 100,
    z5: (p.z5 / sum) * 100,
  };
}

export function percentsForDisciplineSplit(
  split: DisciplineZoneSplit,
  catalog?: ZoneFocusCatalog
): ZoneSplitPercents {
  if (split.mode === "custom" && split.percents) {
    return normalizeZoneSplitPercents(split.percents);
  }
  const focusId = disciplineSplitFocusId(split);
  if (catalog) {
    const fromCatalog = resolveCatalogPercents(catalog, focusId);
    if (fromCatalog) return fromCatalog;
  }
  if (focusId in FOCUS_TIZ_PRESETS) {
    return { ...FOCUS_TIZ_PRESETS[focusId as PhaseFocus] };
  }
  return { ...FOCUS_TIZ_PRESETS.AEROBIC_BASE };
}

export function parseDisciplineZoneSplit(raw: unknown): DisciplineZoneSplit | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const mode = row.mode === "custom" ? "custom" : row.mode === "preset" ? "preset" : null;
  if (!mode) return null;

  const focusId =
    typeof row.focusId === "string"
      ? row.focusId
      : typeof row.focus === "string" && row.focus in FOCUS_TIZ_PRESETS
        ? row.focus
        : undefined;

  const focus =
    typeof row.focus === "string" && row.focus in FOCUS_TIZ_PRESETS
      ? (row.focus as PhaseFocus)
      : focusId && focusId in FOCUS_TIZ_PRESETS
        ? (focusId as PhaseFocus)
        : undefined;

  let percents: ZoneSplitPercents | undefined;
  if (row.percents && typeof row.percents === "object" && !Array.isArray(row.percents)) {
    const p = row.percents as Record<string, unknown>;
    percents = normalizeZoneSplitPercents({
      z1: Number(p.z1) || 0,
      z2: Number(p.z2) || 0,
      z3: Number(p.z3) || 0,
      z4: Number(p.z4) || 0,
      z5: Number(p.z5) || 0,
    });
  }

  if (mode === "custom" && percents) {
    return { mode: "custom", percents, focus, focusId };
  }
  if (focusId) {
    return { mode: "preset", focus, focusId };
  }
  return null;
}

export function parsePhaseZoneSplits(raw: unknown): PhaseZoneSplits | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const result = {} as PhaseZoneSplits;
  let any = false;
  for (const discipline of TRI_PLAN_DISCIPLINES) {
    const parsed = parseDisciplineZoneSplit(row[discipline]);
    if (parsed) {
      result[discipline] = parsed;
      any = true;
    }
  }
  return any ? result : null;
}

export function parsePhaseKindZoneDefaults(raw: unknown): PhaseKindZoneDefaults {
  const defaults = defaultPhaseKindZoneDefaults();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;

  for (const kind of PHASE_KINDS) {
    const parsed = parsePhaseZoneSplits((raw as Record<string, unknown>)[kind]);
    if (parsed) {
      defaults[kind] = {
        SWIM: parsed.SWIM ?? defaults[kind].SWIM,
        BIKE: parsed.BIKE ?? defaults[kind].BIKE,
        RUN: parsed.RUN ?? defaults[kind].RUN,
      };
    }
  }
  return defaults;
}

export function serializePhaseZoneSplits(splits: PhaseZoneSplits): Record<string, DisciplineZoneSplit> {
  const out: Record<string, DisciplineZoneSplit> = {};
  for (const discipline of TRI_PLAN_DISCIPLINES) {
    out[discipline] = splits[discipline];
  }
  return out;
}

export function serializePhaseKindZoneDefaults(defaults: PhaseKindZoneDefaults): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const kind of PHASE_KINDS) {
    out[kind] = serializePhaseZoneSplits(defaults[kind]);
  }
  return out;
}

export function resolvePhaseZoneSplits(input: {
  phaseKind: PhaseKind;
  phaseZoneSplits?: PhaseZoneSplits | null;
  kindDefaults: PhaseKindZoneDefaults;
}): PhaseZoneSplits {
  if (input.phaseZoneSplits) {
    return input.phaseZoneSplits;
  }
  return input.kindDefaults[input.phaseKind] ?? defaultZoneSplitsForKind(input.phaseKind);
}

export function seedPhaseZoneSplits(
  phaseKind: PhaseKind,
  kindDefaults: PhaseKindZoneDefaults
): PhaseZoneSplits {
  return kindDefaults[phaseKind] ?? defaultZoneSplitsForKind(phaseKind);
}

export function inferPhaseKindFromName(name: string): PhaseKind {
  const lower = name.toLowerCase();
  if (lower.includes("taper")) return "TAPER";
  if (lower.includes("race") || lower.includes("prep")) return "RACE_PREP";
  if (lower.includes("build")) return "BUILD";
  return "BASE";
}

export function phaseKindLabel(kind: PhaseKind): string {
  switch (kind) {
    case "BASE":
      return "Base";
    case "BUILD":
      return "Build";
    case "RACE_PREP":
      return "Race prep";
    case "TAPER":
      return "Taper";
    default:
      return kind;
  }
}

export function focusLabel(focus: PhaseFocus): string {
  return focus.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function disciplineZoneSplitSummary(
  split: DisciplineZoneSplit,
  catalog?: ZoneFocusCatalog
): string {
  const percents = percentsForDisciplineSplit(split, catalog);
  return `Z1 ${Math.round(percents.z1)} · Z2 ${Math.round(percents.z2)} · Z3 ${Math.round(percents.z3)} · Z4 ${Math.round(percents.z4)} · Z5 ${Math.round(percents.z5)}`;
}

export function disciplineSplitLabel(
  split: DisciplineZoneSplit,
  catalog?: ZoneFocusCatalog
): string {
  if (split.mode === "custom") return "Custom";
  const focusId = disciplineSplitFocusId(split);
  return catalog ? catalogFocusLabel(catalog, focusId) : focusLabel(focusId as PhaseFocus);
}

export function isCustomDisciplineSplit(split: DisciplineZoneSplit): boolean {
  if (split.mode === "custom") return true;
  if (!split.focus) return false;
  const preset = FOCUS_TIZ_PRESETS[split.focus];
  if (!split.percents) return false;
  const p = split.percents;
  return (
    Math.abs(p.z1 - preset.z1) > 0.05 ||
    Math.abs(p.z2 - preset.z2) > 0.05 ||
    Math.abs(p.z3 - preset.z3) > 0.05 ||
    Math.abs(p.z4 - preset.z4) > 0.05 ||
    Math.abs(p.z5 - preset.z5) > 0.05
  );
}

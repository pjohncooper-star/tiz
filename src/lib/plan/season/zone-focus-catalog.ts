import type { PhaseFocus } from "@prisma/client";
import { FOCUS_TIZ_PRESETS } from "./constants";
import { focusLabel, normalizeZoneSplitPercents } from "./phase-zone-defaults";
import type { ZoneSplitPercents } from "./zone-split-types";

export type ZoneFocusDefinition = {
  id: string;
  name: string;
  percents: ZoneSplitPercents;
  sortOrder: number;
};

export type ZoneFocusCatalog = ZoneFocusDefinition[];

const SEED_FOCUS_ORDER: PhaseFocus[] = [
  "AEROBIC_BASE",
  "THRESHOLD",
  "VO2_MAX",
  "RACE_SPECIFICITY",
  "FRESHNESS",
  "STRENGTH_POWER",
  "MAINTENANCE",
];

export function seedZoneFocusCatalog(): ZoneFocusCatalog {
  return SEED_FOCUS_ORDER.map((id, sortOrder) => ({
    id,
    name: focusLabel(id),
    percents: { ...FOCUS_TIZ_PRESETS[id] },
    sortOrder,
  }));
}

function parsePercents(raw: unknown): ZoneSplitPercents | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  return normalizeZoneSplitPercents({
    z1: Number(row.z1) || 0,
    z2: Number(row.z2) || 0,
    z3: Number(row.z3) || 0,
    z4: Number(row.z4) || 0,
    z5: Number(row.z5) || 0,
  });
}

export function parseZoneFocusCatalog(raw: unknown): ZoneFocusCatalog {
  if (!Array.isArray(raw) || raw.length === 0) {
    return seedZoneFocusCatalog();
  }

  const parsed: ZoneFocusDefinition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const percents = parsePercents(row.percents);
    if (!id || !name || !percents) continue;
    parsed.push({
      id,
      name,
      percents,
      sortOrder: Number(row.sortOrder) || parsed.length,
    });
  }

  return parsed.length > 0
    ? parsed.sort((a, b) => a.sortOrder - b.sortOrder)
    : seedZoneFocusCatalog();
}

export function serializeZoneFocusCatalog(catalog: ZoneFocusCatalog): ZoneFocusDefinition[] {
  return catalog.map((entry, index) => ({
    id: entry.id,
    name: entry.name,
    percents: normalizeZoneSplitPercents(entry.percents),
    sortOrder: index,
  }));
}

export function catalogFocusIds(catalog: ZoneFocusCatalog): Set<string> {
  return new Set(catalog.map((entry) => entry.id));
}

export function resolveCatalogPercents(
  catalog: ZoneFocusCatalog,
  focusId: string
): ZoneSplitPercents | null {
  const entry = catalog.find((item) => item.id === focusId);
  return entry ? normalizeZoneSplitPercents(entry.percents) : null;
}

export function catalogFocusLabel(catalog: ZoneFocusCatalog, focusId: string): string {
  const entry = catalog.find((item) => item.id === focusId);
  if (entry) return entry.name;
  if (focusId in FOCUS_TIZ_PRESETS) {
    return focusLabel(focusId as PhaseFocus);
  }
  return focusId;
}

export function newZoneFocusId(): string {
  return `zf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultNewZoneFocus(catalog: ZoneFocusCatalog): ZoneFocusDefinition {
  return {
    id: newZoneFocusId(),
    name: "New focus",
    percents: { z1: 70, z2: 20, z3: 7, z4: 2, z5: 1 },
    sortOrder: catalog.length,
  };
}

export function validatePhaseKindDefaultsAgainstCatalog(
  catalog: ZoneFocusCatalog,
  defaults: import("./zone-split-types").PhaseKindZoneDefaults
): void {
  const ids = catalogFocusIds(catalog);
  for (const kind of ["BASE", "BUILD", "RACE_PREP", "TAPER"] as const) {
    for (const discipline of ["SWIM", "BIKE", "RUN"] as const) {
      const split = defaults[kind][discipline];
      if (split.mode !== "preset") continue;
      const focusId = split.focusId ?? split.focus;
      if (!focusId || !ids.has(focusId)) {
        throw new Error(`Unknown focus "${focusId ?? ""}" in ${kind} ${discipline}`);
      }
    }
  }
}

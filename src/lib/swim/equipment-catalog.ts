export const SWIM_EQUIPMENT_MAX_LENGTH = 40;
export const SWIM_EQUIPMENT_MAX_COUNT = 30;

export type SwimEquipmentDefinition = {
  /** Stable slug used on workout steps. */
  id: string;
  /** Display name. */
  name: string;
  sortOrder: number;
};

export type SwimEquipmentCatalog = SwimEquipmentDefinition[];

const SEED: ReadonlyArray<{ id: string; name: string }> = [
  { id: "kickboard", name: "Kickboard" },
  { id: "fins", name: "Fins" },
  { id: "pull-buoy", name: "Pull buoy" },
  { id: "paddles", name: "Paddles" },
  { id: "snorkel", name: "Snorkel" },
];

export function seedSwimEquipmentCatalog(): SwimEquipmentCatalog {
  return SEED.map((entry, sortOrder) => ({ ...entry, sortOrder }));
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SWIM_EQUIPMENT_MAX_LENGTH);
}

export function parseSwimEquipmentCatalog(raw: unknown): SwimEquipmentCatalog {
  if (!Array.isArray(raw) || raw.length === 0) {
    return seedSwimEquipmentCatalog();
  }

  const seen = new Set<string>();
  const parsed: SwimEquipmentDefinition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim().slice(0, SWIM_EQUIPMENT_MAX_LENGTH)
        : "";
    const name =
      typeof row.name === "string" && row.name.trim()
        ? row.name.trim().slice(0, SWIM_EQUIPMENT_MAX_LENGTH)
        : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    parsed.push({
      id,
      name,
      sortOrder: Number(row.sortOrder) || parsed.length,
    });
    if (parsed.length >= SWIM_EQUIPMENT_MAX_COUNT) break;
  }

  return parsed.length > 0
    ? parsed.sort((a, b) => a.sortOrder - b.sortOrder)
    : seedSwimEquipmentCatalog();
}

export function serializeSwimEquipmentCatalog(
  catalog: SwimEquipmentCatalog
): SwimEquipmentDefinition[] {
  return catalog.map((entry, index) => ({
    id: entry.id,
    name: entry.name.trim().slice(0, SWIM_EQUIPMENT_MAX_LENGTH),
    sortOrder: index,
  }));
}

export function defaultNewSwimEquipment(
  catalog: SwimEquipmentCatalog
): SwimEquipmentDefinition {
  const base = "equipment";
  let n = catalog.length + 1;
  let id = `${base}-${n}`;
  const ids = new Set(catalog.map((e) => e.id));
  while (ids.has(id)) {
    n += 1;
    id = `${base}-${n}`;
  }
  return { id, name: `Equipment ${n}`, sortOrder: catalog.length };
}

/** Resolve catalog ids to display names; unknown ids fall back to the raw id. */
export function swimEquipmentLabels(
  ids: readonly string[] | undefined | null,
  catalog: SwimEquipmentCatalog
): string[] {
  if (!ids || ids.length === 0) return [];
  const byId = new Map(catalog.map((e) => [e.id, e.name]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const key = id.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(byId.get(key) ?? key);
  }
  return out;
}

/** Keep valid ids only, dedupe, preserve order. */
export function normalizeSwimEquipmentIds(
  raw: unknown,
  max = SWIM_EQUIPMENT_MAX_COUNT
): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim().slice(0, SWIM_EQUIPMENT_MAX_LENGTH);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : undefined;
}

export function suggestSwimEquipmentId(name: string): string {
  return slugify(name) || "equipment";
}

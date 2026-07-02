import type { SurveyResponse } from "@prisma/client";

export const MAX_SELF_EVAL_FIELDS = 6;

export const BUILTIN_FIELD_IDS = ["freshness", "rpe"] as const;
export type BuiltinFieldId = (typeof BUILTIN_FIELD_IDS)[number];

export const PRESET_FIELD_IDS = ["sleep", "motivation", "soreness", "note"] as const;
export type PresetFieldId = (typeof PRESET_FIELD_IDS)[number];

export type SelfEvalFieldKind = "feel" | "rpe" | "scale" | "text";

export type SelfEvalField = {
  id: string;
  label: string;
  kind: SelfEvalFieldKind;
  min?: number;
  max?: number;
};

export type SelfEvalConfig = {
  fields: SelfEvalField[];
};

export const FEEL_BUCKETS = [0, 25, 50, 75, 100] as const;
export const FEEL_LABELS = [
  "Very weak",
  "Weak",
  "Normal",
  "Strong",
  "Very strong",
] as const;

export const PRESET_CATALOG: Record<
  PresetFieldId,
  SelfEvalField & { id: PresetFieldId }
> = {
  sleep: { id: "sleep", label: "Sleep quality", kind: "scale", min: 1, max: 5 },
  motivation: { id: "motivation", label: "Motivation", kind: "scale", min: 1, max: 5 },
  soreness: { id: "soreness", label: "Soreness", kind: "scale", min: 1, max: 5 },
  note: { id: "note", label: "Notes", kind: "text" },
};

const COLUMN_FIELD_IDS = new Set<string>([
  ...BUILTIN_FIELD_IDS,
  ...PRESET_FIELD_IDS,
]);

export function getDefaultSelfEvalConfig(): SelfEvalConfig {
  return {
    fields: [
      { id: "freshness", label: "How it felt", kind: "feel" },
      { id: "rpe", label: "Perceived effort", kind: "rpe" },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCustomFields(raw: unknown): Record<string, number | string> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" || typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function isPresetId(id: string): id is PresetFieldId {
  return (PRESET_FIELD_IDS as readonly string[]).includes(id);
}

function isBuiltinField(field: SelfEvalField, index: number): boolean {
  if (index === 0) {
    return field.id === "freshness" && field.kind === "feel";
  }
  if (index === 1) {
    return field.id === "rpe" && field.kind === "rpe";
  }
  return false;
}

function validateOptionalField(field: unknown): SelfEvalField | null {
  if (!isRecord(field)) return null;
  const id = field.id;
  const label = field.label;
  const kind = field.kind;
  if (typeof id !== "string" || typeof label !== "string" || typeof kind !== "string") {
    return null;
  }
  if (!label.trim()) return null;

  if (isPresetId(id)) {
    const preset = PRESET_CATALOG[id];
    if (kind !== preset.kind) return null;
    if (kind === "scale") {
      return { id, label: label.trim(), kind, min: preset.min, max: preset.max };
    }
    return { id, label: label.trim(), kind };
  }

  if (COLUMN_FIELD_IDS.has(id)) return null;

  if (kind !== "scale") return null;
  const min = field.min;
  const max = field.max;
  if (typeof min !== "number" || typeof max !== "number") return null;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 10 || min >= max) {
    return null;
  }
  return { id, label: label.trim(), kind: "scale", min, max };
}

export function validateSelfEvalConfig(raw: unknown): SelfEvalConfig {
  if (!isRecord(raw) || !Array.isArray(raw.fields)) {
    throw new Error("Invalid self-eval config");
  }

  if (raw.fields.length < 2 || raw.fields.length > MAX_SELF_EVAL_FIELDS) {
    throw new Error(`Self-eval config must have 2-${MAX_SELF_EVAL_FIELDS} fields`);
  }

  const fields: SelfEvalField[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < raw.fields.length; index++) {
    const field = raw.fields[index];
    if (!isRecord(field)) throw new Error("Invalid self-eval field");

    if (index < 2) {
      const id = field.id;
      const label = field.label;
      const kind = field.kind;
      if (typeof id !== "string" || typeof label !== "string" || typeof kind !== "string") {
        throw new Error("Invalid built-in self-eval field");
      }
      const builtin: SelfEvalField = {
        id,
        label: label.trim(),
        kind: kind as SelfEvalFieldKind,
      };
      if (!isBuiltinField(builtin, index) || !builtin.label) {
        throw new Error("Built-in self-eval fields are required");
      }
      if (seenIds.has(builtin.id)) throw new Error("Duplicate self-eval field id");
      seenIds.add(builtin.id);
      fields.push(builtin);
      continue;
    }

    const optional = validateOptionalField(field);
    if (!optional) throw new Error("Invalid optional self-eval field");
    if (seenIds.has(optional.id)) throw new Error("Duplicate self-eval field id");
    seenIds.add(optional.id);
    fields.push(optional);
  }

  return { fields };
}

export function parseSelfEvalConfig(raw: unknown): SelfEvalConfig {
  if (raw == null) return getDefaultSelfEvalConfig();
  try {
    return validateSelfEvalConfig(raw);
  } catch {
    return getDefaultSelfEvalConfig();
  }
}

export type SurveyFieldValue = number | string | null;

export type SurveyLike = Pick<
  SurveyResponse,
  "rpe" | "freshness" | "sleep" | "motivation" | "soreness" | "note" | "customFields"
>;

export function getSurveyFieldValue(
  survey: SurveyLike,
  fieldId: string
): SurveyFieldValue {
  switch (fieldId) {
    case "freshness":
      return survey.freshness;
    case "rpe":
      return survey.rpe;
    case "sleep":
      return survey.sleep;
    case "motivation":
      return survey.motivation;
    case "soreness":
      return survey.soreness;
    case "note":
      return survey.note;
    default:
      return parseCustomFields(survey.customFields)[fieldId] ?? null;
  }
}

export type SurveyUpdateData = {
  rpe?: number | null;
  freshness?: number | null;
  sleep?: number | null;
  motivation?: number | null;
  soreness?: number | null;
  note?: string | null;
  customFields?: Record<string, number | string> | null;
};

export function validateFieldValue(
  field: SelfEvalField,
  value: unknown
): SurveyFieldValue {
  if (value == null || value === "") return null;

  if (field.kind === "feel") {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(num) || !(FEEL_BUCKETS as readonly number[]).includes(num)) {
      throw new Error(`Invalid feel value for ${field.id}`);
    }
    return num;
  }

  if (field.kind === "rpe") {
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(num) || num < 1 || num > 10) {
      throw new Error(`Invalid RPE value for ${field.id}`);
    }
    return num;
  }

  if (field.kind === "scale") {
    const num = typeof value === "number" ? value : Number(value);
    const min = field.min ?? 1;
    const max = field.max ?? 10;
    if (!Number.isInteger(num) || num < min || num > max) {
      throw new Error(`Invalid scale value for ${field.id}`);
    }
    return num;
  }

  if (field.kind === "text") {
    if (typeof value !== "string") throw new Error(`Invalid text value for ${field.id}`);
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  throw new Error(`Unsupported field kind for ${field.id}`);
}

export function buildSurveyUpdateFromValues(
  values: Record<string, unknown>,
  config: SelfEvalConfig
): SurveyUpdateData {
  const update: SurveyUpdateData = {};
  const customFields: Record<string, number | string> = {};

  for (const field of config.fields) {
    if (!(field.id in values)) continue;
    const parsed = validateFieldValue(field, values[field.id]);

    if (field.id === "freshness") {
      update.freshness = parsed as number | null;
      continue;
    }
    if (field.id === "rpe") {
      update.rpe = parsed as number | null;
      continue;
    }
    if (field.id === "sleep") {
      update.sleep = parsed as number | null;
      continue;
    }
    if (field.id === "motivation") {
      update.motivation = parsed as number | null;
      continue;
    }
    if (field.id === "soreness") {
      update.soreness = parsed as number | null;
      continue;
    }
    if (field.id === "note") {
      update.note = parsed as string | null;
      continue;
    }

    if (parsed != null) {
      customFields[field.id] = parsed;
    }
  }

  if (Object.keys(customFields).length > 0) {
    update.customFields = customFields;
  } else {
    update.customFields = null;
  }

  return update;
}

export function valuesFromSurvey(
  survey: SurveyLike,
  config: SelfEvalConfig
): Record<string, SurveyFieldValue> {
  const values: Record<string, SurveyFieldValue> = {};
  for (const field of config.fields) {
    values[field.id] = getSurveyFieldValue(survey, field.id);
  }
  return values;
}

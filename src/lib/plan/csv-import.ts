import type { Discipline, SessionRole } from "@prisma/client";
import { parseDateKey } from "@/lib/dates";
import { defaultSessionTitle, type PlanDiscipline } from "@/lib/plan/session";
import { inferSessionRole } from "@/lib/plan/session-role";
import { computeZoneAllocationMissing } from "@/lib/plan/session-zone";
import {
  buildDisciplineSettings,
  swimDisplayUnit,
  unitSettingsForDiscipline,
  type DisciplineUnitSettings,
  type PoolSize,
} from "@/lib/units/discipline-settings";
import {
  paceInputToCanonical,
  reportingDistanceInputToMeters,
  speedInputToMps,
  type DisplayUnit,
} from "@/lib/workout/metrics";

export const PLANNED_SESSIONS_CSV_HEADERS = [
  "date",
  "discipline",
  "title",
  "duration_min",
  "distance",
  "pace_or_speed",
  "notes",
  "role",
  "pool",
] as const;

export type PlannedSessionsCsvHeader = (typeof PLANNED_SESSIONS_CSV_HEADERS)[number];

export const PLANNED_SESSIONS_CSV_TEMPLATE =
  `${PLANNED_SESSIONS_CSV_HEADERS.join(",")}\n`;

export const MAX_PLANNED_SESSION_CSV_ROWS = 500;
export const MAX_PLANNED_SESSION_CSV_BYTES = 512 * 1024;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DISCIPLINES = new Set<string>(["BIKE", "RUN", "SWIM"]);
const ROLES = new Set<string>(["EASY", "MODERATE", "INTENSITY", "LONG"]);
const POOLS = new Set<string>(["SCY", "SCM", "LCM"]);

export type CsvImportRowError = {
  row: number;
  message: string;
};

export type ParsedPlannedSessionImport = {
  scheduledDate: Date;
  scheduledDateKey: string;
  discipline: PlanDiscipline;
  title: string;
  notes: string | null;
  estimatedDurationMinutes: number | null;
  distanceMeters: number | null;
  targetSpeedMps: number | null;
  targetPaceSeconds: number | null;
  poolSize: PoolSize | null;
  sessionRole: SessionRole;
  zoneAllocationMissing: boolean;
};

export type ParsePlannedSessionsCsvResult =
  | { ok: true; sessions: ParsedPlannedSessionImport[] }
  | { ok: false; errors: CsvImportRowError[] };

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Minimal RFC4180-ish CSV parser (quoted fields, "" escapes, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const input = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const ch = input[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += input[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field in CSV");
  }

  // Trailing content or empty final line after last newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function cell(record: Record<string, string>, key: PlannedSessionsCsvHeader): string {
  return (record[key] ?? "").trim();
}

function parsePositiveInt(raw: string): number | null {
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseOptionalPositiveNumber(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapHeaderRow(headerCells: string[]): Map<PlannedSessionsCsvHeader, number> | string {
  const indexByHeader = new Map<PlannedSessionsCsvHeader, number>();
  const seen = new Set<string>();

  for (let i = 0; i < headerCells.length; i++) {
    const name = normalizeHeader(headerCells[i] ?? "");
    if (!name) continue;
    if (seen.has(name)) return `Duplicate column "${name}"`;
    seen.add(name);
    if ((PLANNED_SESSIONS_CSV_HEADERS as readonly string[]).includes(name)) {
      indexByHeader.set(name as PlannedSessionsCsvHeader, i);
    }
  }

  if (!indexByHeader.has("date")) return 'Missing required column "date"';
  if (!indexByHeader.has("discipline")) return 'Missing required column "discipline"';
  return indexByHeader;
}

function rowToRecord(
  cells: string[],
  indexByHeader: Map<PlannedSessionsCsvHeader, number>
): Record<PlannedSessionsCsvHeader, string> {
  const record = {} as Record<PlannedSessionsCsvHeader, string>;
  for (const header of PLANNED_SESSIONS_CSV_HEADERS) {
    const idx = indexByHeader.get(header);
    record[header] = idx == null ? "" : (cells[idx] ?? "");
  }
  return record;
}

function resolveDisplayUnit(
  discipline: PlanDiscipline,
  poolSize: PoolSize | null,
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): DisplayUnit {
  if (discipline === "SWIM") {
    return swimDisplayUnit(poolSize ?? settings.SWIM.poolSize);
  }
  return unitSettingsForDiscipline(discipline, settings).displayUnit;
}

function parseSessionRow(
  record: Record<PlannedSessionsCsvHeader, string>,
  settings: Record<PlanDiscipline, DisciplineUnitSettings>
): ParsedPlannedSessionImport | string {
  const dateRaw = cell(record, "date");
  if (!DATE_KEY.test(dateRaw)) {
    return "date must be yyyy-MM-dd";
  }

  const disciplineRaw = cell(record, "discipline").toUpperCase();
  if (!DISCIPLINES.has(disciplineRaw)) {
    return "discipline must be BIKE, RUN, or SWIM";
  }
  const discipline = disciplineRaw as PlanDiscipline;

  const poolRaw = cell(record, "pool").toUpperCase();
  let poolSize: PoolSize | null = null;
  if (poolRaw) {
    if (discipline !== "SWIM") return "pool is only valid for SWIM";
    if (!POOLS.has(poolRaw)) return "pool must be SCY, SCM, or LCM";
    poolSize = poolRaw as PoolSize;
  } else if (discipline === "SWIM") {
    poolSize = settings.SWIM.poolSize;
  }

  const displayUnit = resolveDisplayUnit(discipline, poolSize, settings);

  const durationRaw = cell(record, "duration_min");
  let estimatedDurationMinutes: number | null = null;
  if (durationRaw) {
    estimatedDurationMinutes = parsePositiveInt(durationRaw);
    if (estimatedDurationMinutes == null) {
      return "duration_min must be a positive whole number";
    }
  }

  const distanceRaw = cell(record, "distance");
  let distanceMeters: number | null = null;
  if (distanceRaw) {
    if (parseOptionalPositiveNumber(distanceRaw) == null) {
      return "distance must be a positive number";
    }
    distanceMeters = reportingDistanceInputToMeters(distanceRaw, discipline, displayUnit);
    if (distanceMeters == null) {
      return "distance must be a positive number";
    }
  }

  const paceOrSpeedRaw = cell(record, "pace_or_speed");
  let targetPaceSeconds: number | null = null;
  let targetSpeedMps: number | null = null;
  if (paceOrSpeedRaw) {
    if (discipline === "BIKE") {
      targetSpeedMps = speedInputToMps(paceOrSpeedRaw, displayUnit);
      if (targetSpeedMps == null) {
        return displayUnit === "METRIC"
          ? "pace_or_speed must be a positive speed in km/h"
          : "pace_or_speed must be a positive speed in mph";
      }
    } else {
      targetPaceSeconds = paceInputToCanonical(
        paceOrSpeedRaw,
        discipline,
        displayUnit
      );
      if (targetPaceSeconds == null) {
        return "pace_or_speed must be mm:ss";
      }
    }
  }

  const roleRaw = cell(record, "role").toUpperCase();
  let sessionRoleInput: SessionRole | undefined;
  if (roleRaw) {
    if (!ROLES.has(roleRaw)) {
      return "role must be EASY, MODERATE, INTENSITY, or LONG";
    }
    sessionRoleInput = roleRaw as SessionRole;
  }

  const titleRaw = cell(record, "title");
  const title = titleRaw || defaultSessionTitle(discipline);
  const notesRaw = cell(record, "notes");
  if (notesRaw.length > 2000) return "notes must be 2000 characters or fewer";
  if (title.length > 200) return "title must be 200 characters or fewer";

  const sessionRole =
    sessionRoleInput ??
    inferSessionRole({
      title,
      discipline: discipline as Discipline,
      durationMinutes: estimatedDurationMinutes,
    });

  return {
    scheduledDate: parseDateKey(dateRaw),
    scheduledDateKey: dateRaw,
    discipline,
    title,
    notes: notesRaw || null,
    estimatedDurationMinutes,
    distanceMeters,
    targetSpeedMps: discipline === "BIKE" ? targetSpeedMps : null,
    targetPaceSeconds:
      discipline === "RUN" || discipline === "SWIM" ? targetPaceSeconds : null,
    poolSize: discipline === "SWIM" ? poolSize : null,
    sessionRole,
    zoneAllocationMissing: computeZoneAllocationMissing(discipline as Discipline, undefined),
  };
}

export function parsePlannedSessionsCsv(
  text: string,
  settingsInput: Partial<Record<PlanDiscipline, DisciplineUnitSettings>> = {}
): ParsePlannedSessionsCsvResult {
  const settings = buildDisciplineSettings(
    (["BIKE", "RUN", "SWIM"] as const).map((discipline) => ({
      discipline,
      displayUnit: settingsInput[discipline]?.displayUnit ?? "METRIC",
      poolSize: settingsInput[discipline]?.poolSize ?? null,
    }))
  );

  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (e) {
    return {
      ok: false,
      errors: [{ row: 0, message: e instanceof Error ? e.message : "Invalid CSV" }],
    };
  }

  if (rows.length === 0) {
    return { ok: false, errors: [{ row: 0, message: "CSV is empty" }] };
  }

  const headerMap = mapHeaderRow(rows[0]!);
  if (typeof headerMap === "string") {
    return { ok: false, errors: [{ row: 1, message: headerMap }] };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ok: false, errors: [{ row: 0, message: "CSV has no data rows" }] };
  }
  if (dataRows.length > MAX_PLANNED_SESSION_CSV_ROWS) {
    return {
      ok: false,
      errors: [
        {
          row: 0,
          message: `CSV has too many rows (max ${MAX_PLANNED_SESSION_CSV_ROWS})`,
        },
      ],
    };
  }

  const errors: CsvImportRowError[] = [];
  const sessions: ParsedPlannedSessionImport[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // 1-based, accounting for header
    const record = rowToRecord(dataRows[i]!, headerMap);
    if (
      !cell(record, "date") &&
      !cell(record, "discipline") &&
      !cell(record, "title") &&
      !cell(record, "duration_min") &&
      !cell(record, "distance") &&
      !cell(record, "pace_or_speed") &&
      !cell(record, "notes") &&
      !cell(record, "role") &&
      !cell(record, "pool")
    ) {
      continue;
    }

    const parsed = parseSessionRow(record, settings);
    if (typeof parsed === "string") {
      errors.push({ row: rowNumber, message: parsed });
      continue;
    }
    sessions.push(parsed);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (sessions.length === 0) {
    return { ok: false, errors: [{ row: 0, message: "CSV has no data rows" }] };
  }

  return { ok: true, sessions };
}

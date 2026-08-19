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
import {
  primarySignalForDiscipline,
  serializeWorkoutTree,
  totalTreeDurationMinutes,
  WORKOUT_TREE_VERSION,
  type LeafStep,
  type StepIntensity,
  type StepTarget,
  type TargetMode,
  type TargetSignal,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";
import { parseRelativePaceToken } from "@/lib/workout/relative-pace";
import { parseRelativeHrToken } from "@/lib/workout/relative-intensity";

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
  "step",
  "kind",
  "intensity",
  "duration_type",
  "duration",
  "zone",
  "signal",
  "repeat",
  "step_notes",
  "target_mode",
  "target_low",
  "target_high",
  "target",
] as const;

export type PlannedSessionsCsvHeader = (typeof PLANNED_SESSIONS_CSV_HEADERS)[number];

export const PLANNED_SESSIONS_CSV_TEMPLATE =
  `${PLANNED_SESSIONS_CSV_HEADERS.join(",")}\n`;

export const MAX_PLANNED_SESSION_CSV_ROWS = 2000;
export const MAX_PLANNED_SESSION_CSV_BYTES = 1024 * 1024;
/** Max dotted segments in a step id (e.g. `2.1.1` → 3). */
export const MAX_CSV_STEP_ID_DEPTH = 3;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const STEP_ID_RE = /^\d+(?:\.\d+)*$/;
const DISCIPLINES = new Set<string>(["BIKE", "RUN", "SWIM"]);
const ROLES = new Set<string>(["EASY", "MODERATE", "INTENSITY", "LONG"]);
const POOLS = new Set<string>(["SCY", "SCM", "LCM"]);
const STEP_KINDS = new Set<string>(["step", "repeat"]);
const INTENSITIES = new Set<string>([
  "warmup",
  "active",
  "recovery",
  "rest",
  "cooldown",
  "interval",
]);
const DURATION_TYPES = new Set<string>(["time", "distance", "open"]);
const SIGNALS = new Set<string>(["power", "heart_rate", "pace", "speed", "open"]);
const TARGET_MODES = new Set<string>(["zone", "range", "value", "relative"]);

const SESSION_ONLY_HEADERS = [
  "date",
  "discipline",
  "title",
  "duration_min",
  "distance",
  "pace_or_speed",
  "notes",
  "role",
  "pool",
] as const satisfies readonly PlannedSessionsCsvHeader[];

const STEP_HEADERS = [
  "step",
  "kind",
  "intensity",
  "duration_type",
  "duration",
  "zone",
  "signal",
  "repeat",
  "step_notes",
  "target_mode",
  "target_low",
  "target_high",
  "target",
] as const satisfies readonly PlannedSessionsCsvHeader[];

export type CsvImportRowError = {
  row: number;
  message: string;
};

export type CsvImportThresholds = {
  /** Bike FTP in watts — required to resolve power targets like `130%`. */
  ftpWatts?: number | null;
  /** Athlete max HR in bpm — only required for `80%|max` targets. */
  maxHeartRateBpm?: number | null;
};

type CsvStepDraft = {
  rowNumber: number;
  stepId: string;
  kind: "step" | "repeat";
  intensity: StepIntensity | null;
  durationType: "time" | "distance" | "open" | null;
  durationRaw: string;
  zone: number | null;
  signal: TargetSignal | null;
  repeat: number | null;
  stepNotes: string | null;
  targetMode: TargetMode | null;
  targetLowRaw: string;
  targetHighRaw: string;
  targetRaw: string;
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
  workoutTree: WorkoutTreeDocument | null;
};

export type ParsePlannedSessionsCsvResult =
  | { ok: true; sessions: ParsedPlannedSessionImport[] }
  | { ok: false; errors: CsvImportRowError[] };

type SessionGroupAccumulator = {
  firstRowNumber: number;
  sessionRecord: Record<PlannedSessionsCsvHeader, string>;
  steps: CsvStepDraft[];
};

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

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cellValue) => cellValue.trim() !== ""));
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

function recordHasAny(
  record: Record<PlannedSessionsCsvHeader, string>,
  keys: readonly PlannedSessionsCsvHeader[]
): boolean {
  return keys.some((key) => cell(record, key) !== "");
}

function sessionGroupKey(dateKey: string, discipline: string, title: string): string {
  return `${dateKey}\0${discipline}\0${title}`;
}

function compareStepIds(a: string, b: string): number {
  const as = a.split(".").map(Number);
  const bs = b.split(".").map(Number);
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const av = as[i] ?? 0;
    const bv = bs[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function parentStepId(stepId: string): string | null {
  const idx = stepId.lastIndexOf(".");
  if (idx <= 0) return null;
  return stepId.slice(0, idx);
}

function parseStepDraft(
  record: Record<PlannedSessionsCsvHeader, string>,
  rowNumber: number
): CsvStepDraft | string | null {
  if (!recordHasAny(record, STEP_HEADERS)) return null;

  const stepId = cell(record, "step");
  if (!STEP_ID_RE.test(stepId)) {
    return 'step must be an id like "1" or "2.1"';
  }

  const kindRaw = cell(record, "kind").toLowerCase();
  if (!STEP_KINDS.has(kindRaw)) {
    return 'kind must be "step" or "repeat"';
  }
  const kind = kindRaw as "step" | "repeat";

  const intensityRaw = cell(record, "intensity").toLowerCase();
  let intensity: StepIntensity | null = null;
  if (intensityRaw) {
    if (!INTENSITIES.has(intensityRaw)) {
      return "intensity must be warmup, active, interval, recovery, rest, or cooldown";
    }
    intensity = intensityRaw as StepIntensity;
  }

  const durationTypeRaw = cell(record, "duration_type").toLowerCase();
  let durationType: "time" | "distance" | "open" | null = null;
  if (durationTypeRaw) {
    if (!DURATION_TYPES.has(durationTypeRaw)) {
      return 'duration_type must be "time", "distance", or "open"';
    }
    durationType = durationTypeRaw as "time" | "distance" | "open";
  }

  const durationRaw = cell(record, "duration");
  const zoneRaw = cell(record, "zone");
  let zone: number | null = null;
  if (zoneRaw) {
    zone = parsePositiveInt(zoneRaw);
    if (zone == null || zone > 7) return "zone must be an integer 1–7";
  }

  const signalRaw = cell(record, "signal").toLowerCase();
  let signal: TargetSignal | null = null;
  if (signalRaw) {
    if (!SIGNALS.has(signalRaw)) {
      return "signal must be power, heart_rate, pace, speed, or open";
    }
    signal = signalRaw as TargetSignal;
  }

  const repeatRaw = cell(record, "repeat");
  let repeat: number | null = null;
  if (repeatRaw) {
    repeat = parsePositiveInt(repeatRaw);
    if (repeat == null) return "repeat must be a positive whole number";
  }

  const stepNotes = cell(record, "step_notes") || null;
  if (stepNotes && stepNotes.length > 2000) {
    return "step_notes must be 2000 characters or fewer";
  }

  const targetModeRaw = cell(record, "target_mode").toLowerCase();
  let targetMode: TargetMode | null = null;
  if (targetModeRaw) {
    if (!TARGET_MODES.has(targetModeRaw)) {
      return 'target_mode must be "zone", "range", "value", or "relative"';
    }
    targetMode = targetModeRaw as TargetMode;
  }

  const targetLowRaw = cell(record, "target_low");
  const targetHighRaw = cell(record, "target_high");
  const targetRaw = cell(record, "target");

  if (kind === "repeat") {
    if (repeat == null) return "repeat rows require repeat count";
    if (
      intensity ||
      durationType ||
      durationRaw ||
      zone ||
      signal ||
      targetMode ||
      targetLowRaw ||
      targetHighRaw ||
      targetRaw
    ) {
      return "repeat rows only use step, kind, repeat, and step_notes";
    }
  } else {
    if (!intensity) return "step rows require intensity";
    if (!durationType) return "step rows require duration_type";
    if (durationType !== "open" && !durationRaw) {
      return "step rows require duration unless duration_type is open";
    }
    if (repeat != null) return "repeat is only valid on repeat rows";
  }

  return {
    rowNumber,
    stepId,
    kind,
    intensity,
    durationType,
    durationRaw,
    zone,
    signal,
    repeat,
    stepNotes,
    targetMode,
    targetLowRaw,
    targetHighRaw,
    targetRaw,
  };
}

function parsePercentOrNumber(raw: string): { kind: "percent" | "number"; value: number } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const percentMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (percentMatch) {
    const value = Number(percentMatch[1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    return { kind: "percent", value };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { kind: "number", value };
}

function parseAbsoluteTarget(
  raw: string,
  signal: Exclude<TargetSignal, "open">,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  thresholds: CsvImportThresholds
): number | string {
  if (signal === "pace") {
    if (discipline !== "RUN" && discipline !== "SWIM") {
      return "pace targets are only valid for RUN or SWIM";
    }
    const pace = paceInputToCanonical(raw, discipline, displayUnit);
    if (pace == null) return "pace target must be mm:ss";
    return pace;
  }

  if (signal === "speed") {
    const speed = speedInputToMps(raw, displayUnit);
    if (speed == null) {
      return displayUnit === "METRIC"
        ? "speed target must be a positive number in km/h"
        : "speed target must be a positive number in mph";
    }
    return speed;
  }

  const parsed = parsePercentOrNumber(raw);
  if (!parsed) {
    return signal === "power"
      ? "power target must be watts or a percent like 130%"
      : "heart_rate target must be bpm or a percent like 80%";
  }

  if (parsed.kind === "percent") {
    if (signal === "power") {
      const ftp = thresholds.ftpWatts;
      if (ftp == null || !(ftp > 0)) {
        return "power percent targets require athlete bike FTP";
      }
      return Math.round((ftp * parsed.value) / 100);
    }
    return "heart_rate range targets must be bpm, not percent";
  }

  return Math.round(parsed.value);
}

function resolveTargetMode(draft: CsvStepDraft): TargetMode {
  if (draft.targetMode) return draft.targetMode;
  if (draft.targetRaw) return "value";
  if (draft.targetLowRaw || draft.targetHighRaw) return "range";
  return "zone";
}

function targetFromDraft(
  draft: CsvStepDraft,
  signal: TargetSignal,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  thresholds: CsvImportThresholds
): StepTarget | string {
  if (signal === "open") {
    if (
      draft.zone != null ||
      draft.targetRaw ||
      draft.targetLowRaw ||
      draft.targetHighRaw ||
      (draft.targetMode && draft.targetMode !== "value")
    ) {
      return "open signal cannot combine with zone or absolute targets";
    }
    return { signal: "open", mode: "value" };
  }

  const mode = resolveTargetMode(draft);

  if (mode === "zone") {
    if (draft.targetRaw || draft.targetLowRaw || draft.targetHighRaw) {
      return "zone target_mode cannot include target, target_low, or target_high";
    }
    return {
      signal,
      mode: "zone",
      zone: draft.zone ?? (draft.intensity === "rest" ? 1 : 2),
    };
  }

  if (mode === "value") {
    if (!draft.targetRaw) return "value target_mode requires target";
    if (draft.zone != null || draft.targetLowRaw || draft.targetHighRaw) {
      return "value target_mode cannot include zone, target_low, or target_high";
    }
    // Power/HR percents stay relative (resolve at display/FIT from current FTP / LTHR / max HR).
    if (signal === "power" || signal === "heart_rate") {
      if (signal === "heart_rate") {
        const hrParsed = parseRelativeHrToken(draft.targetRaw);
        if (typeof hrParsed !== "string") {
          return {
            signal,
            mode: "relative",
            pct: hrParsed.pct,
            ...(hrParsed.ref ? { ref: hrParsed.ref } : {}),
          };
        }
        if (draft.targetRaw.includes("%")) return hrParsed;
      } else {
        const pctParsed = parsePercentOrNumber(draft.targetRaw);
        if (pctParsed?.kind === "percent") {
          if (!(pctParsed.value > 0)) {
            return "power percent must be positive";
          }
          return { signal, mode: "relative", pct: pctParsed.value };
        }
      }
    }
    const value = parseAbsoluteTarget(
      draft.targetRaw,
      signal,
      discipline,
      displayUnit,
      thresholds
    );
    if (typeof value === "string") return value;
    return { signal, mode: "value", value };
  }

  if (mode === "relative") {
    if (draft.zone != null) {
      return "relative target_mode cannot include zone";
    }
    // Percent range: target_low=88%, target_high=97% (optionally with target as ref for pace)
    if (draft.targetLowRaw && draft.targetHighRaw) {
      const lowPct = parsePercentOrNumber(draft.targetLowRaw);
      const highPct = parsePercentOrNumber(draft.targetHighRaw);
      if (
        lowPct?.kind === "percent" &&
        highPct?.kind === "percent" &&
        lowPct.value > 0 &&
        highPct.value > 0
      ) {
        if (signal === "pace") {
          if (discipline !== "RUN" && discipline !== "SWIM") {
            return "relative pace targets are only valid for RUN or SWIM";
          }
          if (!draft.targetRaw) {
            return "relative pace range requires target for the ref (e.g. threshold, 10k)";
          }
          const parsed = parseRelativePaceToken(draft.targetRaw);
          if (typeof parsed === "string") return parsed;
          return {
            signal: "pace",
            mode: "relative" as const,
            ref: parsed.ref,
            pctLow: lowPct.value,
            pctHigh: highPct.value,
          };
        }
        if (signal === "power") {
          return {
            signal,
            mode: "relative" as const,
            pctLow: lowPct.value,
            pctHigh: highPct.value,
          };
        }
        if (signal === "heart_rate") {
          return {
            signal,
            mode: "relative" as const,
            pctLow: lowPct.value,
            pctHigh: highPct.value,
          };
        }
      }
      return "relative range requires target_low and target_high as percents (e.g. 88%, 97%)";
    }
    if (!draft.targetRaw) {
      return signal === "pace"
        ? "relative target_mode requires target (e.g. 10k, threshold, 95%|10k)"
        : "relative target_mode requires target (e.g. 130%)";
    }
    if (signal === "pace") {
      if (discipline !== "RUN" && discipline !== "SWIM") {
        return "relative pace targets are only valid for RUN or SWIM";
      }
      const parsed = parseRelativePaceToken(draft.targetRaw);
      if (typeof parsed === "string") return parsed;
      return {
        signal: "pace",
        mode: "relative",
        ref: parsed.ref,
        ...(parsed.pct != null ? { pct: parsed.pct } : {}),
      };
    }
    if (signal === "power" || signal === "heart_rate") {
      if (signal === "heart_rate") {
        const hrParsed = parseRelativeHrToken(draft.targetRaw);
        if (typeof hrParsed === "string") return hrParsed;
        return {
          signal,
          mode: "relative",
          pct: hrParsed.pct,
          ...(hrParsed.ref ? { ref: hrParsed.ref } : {}),
        };
      }
      const pctParsed = parsePercentOrNumber(draft.targetRaw);
      if (!pctParsed || pctParsed.kind !== "percent" || !(pctParsed.value > 0)) {
        return "relative power target must be a percent like 130%";
      }
      return { signal, mode: "relative", pct: pctParsed.value };
    }
    return "relative target_mode is only valid with signal=pace, power, or heart_rate";
  }

  // range
  if (!draft.targetLowRaw || !draft.targetHighRaw) {
    return "range target_mode requires target_low and target_high";
  }
  if (draft.zone != null || draft.targetRaw) {
    return "range target_mode cannot include zone or target";
  }
  // Percent range shorthand: target_low=88%, target_high=97% with range mode
  if (signal === "power" || signal === "heart_rate") {
    const lowPct = parsePercentOrNumber(draft.targetLowRaw);
    const highPct = parsePercentOrNumber(draft.targetHighRaw);
    if (lowPct?.kind === "percent" && highPct?.kind === "percent") {
      if (!(lowPct.value > 0) || !(highPct.value > 0)) {
        return "percent range values must be positive";
      }
      return {
        signal,
        mode: "relative" as const,
        pctLow: lowPct.value,
        pctHigh: highPct.value,
      };
    }
  }
  const low = parseAbsoluteTarget(
    draft.targetLowRaw,
    signal,
    discipline,
    displayUnit,
    thresholds
  );
  if (typeof low === "string") return low;
  const high = parseAbsoluteTarget(
    draft.targetHighRaw,
    signal,
    discipline,
    displayUnit,
    thresholds
  );
  if (typeof high === "string") return high;
  return { signal, mode: "range", low, high };
}

function leafFromDraft(
  draft: CsvStepDraft,
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  thresholds: CsvImportThresholds
): LeafStep | string {
  if (draft.kind !== "step" || !draft.intensity || !draft.durationType) {
    return `Row ${draft.rowNumber}: invalid step`;
  }

  const signal =
    draft.signal ??
    (draft.intensity === "rest"
      ? "open"
      : primarySignalForDiscipline(discipline as Discipline));

  let duration: LeafStep["duration"];
  if (draft.durationType === "time") {
    const minutes = parseOptionalPositiveNumber(draft.durationRaw);
    if (minutes == null) return `Row ${draft.rowNumber}: duration must be a positive number of minutes`;
    duration = { type: "time", value: Math.round(minutes * 60) };
  } else if (draft.durationType === "distance") {
    const meters = reportingDistanceInputToMeters(
      draft.durationRaw,
      discipline,
      displayUnit
    );
    if (meters == null) {
      return `Row ${draft.rowNumber}: duration must be a positive distance`;
    }
    duration = { type: "distance", value: meters };
  } else {
    const estimateMinutes = draft.durationRaw
      ? parseOptionalPositiveNumber(draft.durationRaw)
      : null;
    if (draft.durationRaw && estimateMinutes == null) {
      return `Row ${draft.rowNumber}: open duration estimate must be a positive number of minutes`;
    }
    duration = {
      type: "open",
      ...(estimateMinutes != null
        ? { estimateSeconds: Math.round(estimateMinutes * 60) }
        : {}),
    };
  }

  const target = targetFromDraft(draft, signal, discipline, displayUnit, thresholds);
  if (typeof target === "string") {
    return `Row ${draft.rowNumber}: ${target}`;
  }

  const step: LeafStep = {
    kind: "step",
    intensity: draft.intensity,
    duration,
    target,
    ...(draft.stepNotes ? { notes: draft.stepNotes } : {}),
  };

  if (draft.durationType === "distance" && duration.type === "distance") {
    step.distanceMeters = duration.value;
  }

  if (target.signal === "pace" && target.mode === "value" && target.value != null) {
    step.targetPaceSeconds = target.value;
  }
  if (target.signal === "pace" && target.mode === "range" && target.low != null && target.high != null) {
    step.targetPaceSeconds = Math.round((target.low + target.high) / 2);
  }
  // relative: do not bake targetPaceSeconds — resolve at display/FIT from athlete anchors
  if (target.signal === "speed" && target.mode === "value" && target.value != null) {
    step.targetSpeedMps = target.value;
  }

  return step;
}

function buildNodeFromDraft(
  draft: CsvStepDraft,
  drafts: CsvStepDraft[],
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  thresholds: CsvImportThresholds
): WorkoutNode | string {
  if (draft.kind === "step") {
    return leafFromDraft(draft, discipline, displayUnit, thresholds);
  }

  const children = drafts
    .filter((child) => parentStepId(child.stepId) === draft.stepId)
    .sort((a, b) => compareStepIds(a.stepId, b.stepId));
  if (children.length === 0) {
    return `Row ${draft.rowNumber}: repeat "${draft.stepId}" has no child steps`;
  }

  const childNodes: WorkoutNode[] = [];
  for (const child of children) {
    const built = buildNodeFromDraft(child, drafts, discipline, displayUnit, thresholds);
    if (typeof built === "string") return built;
    childNodes.push(built);
  }

  return {
    kind: "repeat",
    repeatCount: draft.repeat!,
    children: childNodes,
    ...(draft.stepNotes ? { notes: draft.stepNotes } : {}),
  };
}

export function buildWorkoutTreeFromStepDrafts(
  drafts: CsvStepDraft[],
  discipline: PlanDiscipline,
  displayUnit: DisplayUnit,
  thresholds: CsvImportThresholds = {}
): WorkoutTreeDocument | string {
  if (drafts.length === 0) {
    return { version: WORKOUT_TREE_VERSION, nodes: [] };
  }

  const byId = new Map<string, CsvStepDraft>();
  for (const draft of drafts) {
    if (byId.has(draft.stepId)) {
      return `Duplicate step id "${draft.stepId}"`;
    }
    byId.set(draft.stepId, draft);
  }

  for (const draft of drafts) {
    const depth = draft.stepId.split(".").length;
    if (depth > MAX_CSV_STEP_ID_DEPTH) {
      return `Row ${draft.rowNumber}: step nesting deeper than ${MAX_CSV_STEP_ID_DEPTH} levels is not supported`;
    }
    const parentId = parentStepId(draft.stepId);
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) {
      return `Row ${draft.rowNumber}: missing parent step "${parentId}"`;
    }
    if (parent.kind !== "repeat") {
      return `Row ${draft.rowNumber}: parent "${parentId}" must be a repeat row`;
    }
  }

  const roots = drafts
    .filter((draft) => parentStepId(draft.stepId) == null)
    .sort((a, b) => compareStepIds(a.stepId, b.stepId));

  const nodes: WorkoutNode[] = [];
  for (const root of roots) {
    const built = buildNodeFromDraft(root, drafts, discipline, displayUnit, thresholds);
    if (typeof built === "string") return built;
    nodes.push(built);
  }

  return serializeWorkoutTree({ version: WORKOUT_TREE_VERSION, nodes });
}

function mergeSessionFields(
  into: Record<PlannedSessionsCsvHeader, string>,
  from: Record<PlannedSessionsCsvHeader, string>
) {
  for (const key of SESSION_ONLY_HEADERS) {
    if (!cell(into, key) && cell(from, key)) {
      into[key] = from[key]!;
    }
  }
}

function parseSessionFields(
  record: Record<PlannedSessionsCsvHeader, string>,
  settings: Record<PlanDiscipline, DisciplineUnitSettings>,
  workoutTree: WorkoutTreeDocument | null
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

  if (
    workoutTree &&
    workoutTree.nodes.length > 0 &&
    estimatedDurationMinutes == null
  ) {
    const fromTree = totalTreeDurationMinutes(workoutTree.nodes);
    estimatedDurationMinutes = fromTree > 0 ? fromTree : null;
  }

  const sessionRole =
    sessionRoleInput ??
    inferSessionRole({
      title,
      discipline: discipline as Discipline,
    });

  const zoneAllocationMissing = computeZoneAllocationMissing(
    discipline as Discipline,
    undefined,
    estimatedDurationMinutes,
    workoutTree && workoutTree.nodes.length > 0 ? workoutTree : undefined
  );

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
    zoneAllocationMissing,
    workoutTree:
      workoutTree && workoutTree.nodes.length > 0 ? workoutTree : null,
  };
}

export function parsePlannedSessionsCsv(
  text: string,
  settingsInput: Partial<Record<PlanDiscipline, DisciplineUnitSettings>> = {},
  thresholds: CsvImportThresholds = {}
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
  const groups = new Map<string, SessionGroupAccumulator>();

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2;
    const record = rowToRecord(dataRows[i]!, headerMap);
    if (!recordHasAny(record, PLANNED_SESSIONS_CSV_HEADERS)) {
      continue;
    }

    const dateRaw = cell(record, "date");
    const disciplineRaw = cell(record, "discipline").toUpperCase();
    if (!DATE_KEY.test(dateRaw)) {
      errors.push({ row: rowNumber, message: "date must be yyyy-MM-dd" });
      continue;
    }
    if (!DISCIPLINES.has(disciplineRaw)) {
      errors.push({
        row: rowNumber,
        message: "discipline must be BIKE, RUN, or SWIM",
      });
      continue;
    }

    const title =
      cell(record, "title") || defaultSessionTitle(disciplineRaw as PlanDiscipline);
    const key = sessionGroupKey(dateRaw, disciplineRaw, title);

    let group = groups.get(key);
    if (!group) {
      group = {
        firstRowNumber: rowNumber,
        sessionRecord: { ...record },
        steps: [],
      };
      groups.set(key, group);
    } else {
      mergeSessionFields(group.sessionRecord, record);
    }

    const stepDraft = parseStepDraft(record, rowNumber);
    if (typeof stepDraft === "string") {
      errors.push({ row: rowNumber, message: stepDraft });
      continue;
    }
    if (stepDraft) {
      group.steps.push(stepDraft);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  if (groups.size === 0) {
    return { ok: false, errors: [{ row: 0, message: "CSV has no data rows" }] };
  }

  const sessions: ParsedPlannedSessionImport[] = [];
  for (const group of groups.values()) {
    const discipline = cell(group.sessionRecord, "discipline").toUpperCase() as PlanDiscipline;
    const poolRaw = cell(group.sessionRecord, "pool").toUpperCase();
    const poolSize =
      discipline === "SWIM"
        ? ((POOLS.has(poolRaw) ? poolRaw : settings.SWIM.poolSize) as PoolSize | null)
        : null;
    const displayUnit = resolveDisplayUnit(discipline, poolSize, settings);

    let workoutTree: WorkoutTreeDocument | null = null;
    if (group.steps.length > 0) {
      const built = buildWorkoutTreeFromStepDrafts(
        group.steps,
        discipline,
        displayUnit,
        thresholds
      );
      if (typeof built === "string") {
        errors.push({ row: group.firstRowNumber, message: built });
        continue;
      }
      workoutTree = built;
    }

    const parsed = parseSessionFields(group.sessionRecord, settings, workoutTree);
    if (typeof parsed === "string") {
      errors.push({ row: group.firstRowNumber, message: parsed });
      continue;
    }
    sessions.push(parsed);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, sessions };
}

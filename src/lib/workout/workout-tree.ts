import type { Discipline } from "@prisma/client";
import type { WorkoutStep, WorkoutStepType, ZoneMinutes } from "@/lib/workout/workout-types";

export const WORKOUT_TREE_VERSION = 2 as const;

export type StepIntensity =
  | "warmup"
  | "active"
  | "recovery"
  | "rest"
  | "cooldown"
  | "interval";

export type TargetSignal = "power" | "heart_rate" | "pace" | "speed" | "open";

export type TargetMode = "zone" | "range" | "value";

export type StepDuration =
  | { type: "time"; value: number }
  | { type: "distance"; value: number }
  | { type: "open"; estimateSeconds?: number };

export type StepTarget = {
  signal: TargetSignal;
  mode: TargetMode;
  zone?: number;
  low?: number;
  high?: number;
  value?: number;
};

export type LeafStep = {
  kind: "step";
  intensity: StepIntensity;
  duration: StepDuration;
  target: StepTarget;
  distanceMeters?: number;
  targetSpeedMps?: number;
  targetPaceSeconds?: number;
  notes?: string;
};

export type RepeatBlock = {
  kind: "repeat";
  repeatCount: number;
  children: WorkoutNode[];
  notes?: string;
};

export type RampStep = {
  kind: "ramp";
  duration: { type: "time"; value: number };
  target: {
    signal: Exclude<TargetSignal, "open">;
    low: number;
    high: number;
    mode?: "zone" | "range";
    lowZone?: number;
    highZone?: number;
  };
  notes?: string;
};

export type WorkoutNode = LeafStep | RepeatBlock | RampStep;

export type WorkoutTreeDocument = {
  version: typeof WORKOUT_TREE_VERSION;
  nodes: WorkoutNode[];
};

export type FlatPlanningStep = {
  type: WorkoutStepType;
  durationMinutes: number;
  durationSeconds: number;
  targetZone: number;
  distanceMeters?: number;
  targetSpeedMps?: number;
  targetPaceSeconds?: number;
  openDuration?: boolean;
};

const INTENSITY_TO_LEGACY: Record<StepIntensity, WorkoutStepType> = {
  warmup: "warmup",
  cooldown: "cooldown",
  rest: "rest",
  recovery: "rest",
  active: "steady",
  interval: "steady",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseTarget(raw: unknown): StepTarget {
  if (!isRecord(raw)) return { signal: "power", mode: "zone", zone: 2 };
  const signal = raw.signal;
  const mode = raw.mode;
  const zone = Number(raw.zone);
  const low = Number(raw.low);
  const high = Number(raw.high);
  const value = Number(raw.value);
  return {
    signal:
      signal === "heart_rate" ||
      signal === "pace" ||
      signal === "speed" ||
      signal === "open"
        ? signal
        : "power",
    mode: mode === "range" || mode === "value" ? mode : "zone",
    ...(Number.isInteger(zone) && zone >= 1 && zone <= 7 ? { zone } : {}),
    ...(Number.isFinite(low) ? { low } : {}),
    ...(Number.isFinite(high) ? { high } : {}),
    ...(Number.isFinite(value) ? { value } : {}),
  };
}

function parseDuration(raw: unknown, legacyMinutes?: number): StepDuration {
  if (isRecord(raw)) {
    const type = raw.type;
    const value = Number(raw.value);
    const estimateSeconds = Number(raw.estimateSeconds);
    if (type === "open") {
      return {
        type: "open",
        ...(Number.isFinite(estimateSeconds) && estimateSeconds > 0
          ? { estimateSeconds }
          : {}),
      };
    }
    if (type === "distance" && Number.isFinite(value) && value > 0) {
      return { type: "distance", value };
    }
    if (type === "time" && Number.isFinite(value) && value > 0) {
      return { type: "time", value };
    }
  }
  if (legacyMinutes != null && legacyMinutes > 0) {
    return { type: "time", value: legacyMinutes * 60 };
  }
  return { type: "time", value: 600 };
}

function parseLeafStep(raw: Record<string, unknown>): LeafStep | null {
  const intensity = raw.intensity;
  const duration = parseDuration(raw.duration, Number(raw.durationMinutes));
  const target = parseTarget(raw.target);
  if (
    intensity !== "warmup" &&
    intensity !== "active" &&
    intensity !== "recovery" &&
    intensity !== "rest" &&
    intensity !== "cooldown" &&
    intensity !== "interval"
  ) {
    const legacyType = raw.type;
    const mapped =
      legacyType === "warmup"
        ? "warmup"
        : legacyType === "cooldown"
          ? "cooldown"
          : legacyType === "rest"
            ? "rest"
            : "active";
    const zone = Number(raw.targetZone);
    return {
      kind: "step",
      intensity: mapped,
      duration,
      target: {
        signal: "power",
        mode: "zone",
        zone: Number.isInteger(zone) && zone >= 1 && zone <= 7 ? zone : 2,
      },
      ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
    };
  }
  const step: LeafStep = { kind: "step", intensity, duration, target };
  const distanceMeters = Number(raw.distanceMeters);
  const targetSpeedMps = Number(raw.targetSpeedMps);
  const targetPaceSeconds = Number(raw.targetPaceSeconds);
  if (Number.isFinite(distanceMeters) && distanceMeters > 0) step.distanceMeters = distanceMeters;
  if (Number.isFinite(targetSpeedMps) && targetSpeedMps > 0) step.targetSpeedMps = targetSpeedMps;
  if (Number.isFinite(targetPaceSeconds) && targetPaceSeconds > 0) {
    step.targetPaceSeconds = targetPaceSeconds;
  }
  if (typeof raw.notes === "string" && raw.notes.trim()) step.notes = raw.notes.trim();
  return step;
}

function parseRampStep(raw: Record<string, unknown>): RampStep | null {
  const durationVal = isRecord(raw.duration) ? Number(raw.duration.value) : Number(raw.durationSeconds);
  if (!Number.isFinite(durationVal) || durationVal <= 0) return null;
  const targetRaw = isRecord(raw.target) ? raw.target : {};
  const signal = targetRaw.signal;
  const low = Number(targetRaw.low);
  const high = Number(targetRaw.high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return {
    kind: "ramp",
    duration: { type: "time", value: durationVal },
    target: {
      signal:
        signal === "heart_rate" || signal === "pace" || signal === "speed"
          ? signal
          : "power",
      low,
      high,
    },
    ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
  };
}

function parseRepeatBlock(raw: Record<string, unknown>): RepeatBlock | null {
  const repeatCount = Number(raw.repeatCount);
  if (!Number.isInteger(repeatCount) || repeatCount < 1) return null;
  const children = parseWorkoutNodes(raw.children);
  if (children.length === 0) return null;
  return {
    kind: "repeat",
    repeatCount,
    children,
    ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
  };
}

function parseWorkoutNode(raw: unknown): WorkoutNode | null {
  if (!isRecord(raw)) return null;
  const kind = raw.kind;
  if (kind === "repeat") return parseRepeatBlock(raw);
  if (kind === "ramp") return parseRampStep(raw);
  if (kind === "step") return parseLeafStep(raw);
  if (raw.type && raw.durationMinutes) return parseLeafStep(raw);
  return null;
}

export function parseWorkoutNodes(raw: unknown): WorkoutNode[] {
  if (!raw) return [];
  if (isRecord(raw) && raw.version === WORKOUT_TREE_VERSION && Array.isArray(raw.nodes)) {
    return raw.nodes.map(parseWorkoutNode).filter((n): n is WorkoutNode => n != null);
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(parseWorkoutNode).filter((n): n is WorkoutNode => n != null);
}

export function legacyStepsToNodes(steps: WorkoutStep[]): WorkoutNode[] {
  return steps.map((step) => ({
    kind: "step" as const,
    intensity:
      step.type === "warmup"
        ? "warmup"
        : step.type === "cooldown"
          ? "cooldown"
          : step.type === "rest"
            ? "rest"
            : "active",
    duration: { type: "time" as const, value: step.durationMinutes * 60 },
    target: { signal: "power" as const, mode: "zone" as const, zone: step.targetZone },
    ...(step.distanceMeters ? { distanceMeters: step.distanceMeters } : {}),
    ...(step.targetSpeedMps ? { targetSpeedMps: step.targetSpeedMps } : {}),
    ...(step.targetPaceSeconds ? { targetPaceSeconds: step.targetPaceSeconds } : {}),
  }));
}

export function parseWorkoutTree(raw: unknown): WorkoutTreeDocument {
  const fromDoc = parseWorkoutNodes(raw);
  if (fromDoc.length > 0 || (isRecord(raw) && raw.version === WORKOUT_TREE_VERSION)) {
    return { version: WORKOUT_TREE_VERSION, nodes: fromDoc };
  }
  const legacy = parseLegacyFlatSteps(raw);
  return { version: WORKOUT_TREE_VERSION, nodes: legacyStepsToNodes(legacy) };
}

function parseLegacyFlatSteps(raw: unknown): WorkoutStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: WorkoutStep[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (item.kind) continue;
    const durationMinutes = Number(item.durationMinutes);
    const targetZone = Number(item.targetZone);
    const type = item.type;
    if (
      !Number.isFinite(durationMinutes) ||
      durationMinutes <= 0 ||
      !Number.isInteger(targetZone) ||
      targetZone < 1 ||
      targetZone > 7
    ) {
      continue;
    }
    if (type !== "steady" && type !== "warmup" && type !== "cooldown" && type !== "rest") {
      continue;
    }
    const step: WorkoutStep = { type, durationMinutes, targetZone };
    const distanceMeters = Number(item.distanceMeters);
    const targetSpeedMps = Number(item.targetSpeedMps);
    const targetPaceSeconds = Number(item.targetPaceSeconds);
    if (Number.isFinite(distanceMeters) && distanceMeters > 0) step.distanceMeters = distanceMeters;
    if (Number.isFinite(targetSpeedMps) && targetSpeedMps > 0) step.targetSpeedMps = targetSpeedMps;
    if (Number.isFinite(targetPaceSeconds) && targetPaceSeconds > 0) {
      step.targetPaceSeconds = targetPaceSeconds;
    }
    steps.push(step);
  }
  return steps;
}

export function serializeWorkoutTree(doc: WorkoutTreeDocument): WorkoutTreeDocument {
  return { version: WORKOUT_TREE_VERSION, nodes: doc.nodes };
}

export function targetZoneFromTarget(target: StepTarget): number {
  if (target.mode === "zone" && target.zone) return target.zone;
  if (target.mode === "range" && target.low != null && target.high != null) {
    return Math.round((target.low + target.high) / 2);
  }
  if (target.value != null) return Math.max(1, Math.min(7, Math.round(target.value)));
  return 2;
}

export function rampMidpointZone(low: number, high: number): number {
  return Math.max(1, Math.min(7, Math.round((low + high) / 2)));
}

function leafDurationSeconds(step: LeafStep): number {
  if (step.duration.type === "time") return step.duration.value;
  if (step.duration.type === "open") return step.duration.estimateSeconds ?? 0;
  return 0;
}

function rampDurationSeconds(step: RampStep): number {
  return step.duration.value;
}

function paceSecondsFromLeafTarget(step: LeafStep): number | undefined {
  if (step.targetPaceSeconds != null && step.targetPaceSeconds > 0) {
    return step.targetPaceSeconds;
  }
  const t = step.target;
  if (t.signal !== "pace" && t.signal !== "speed") return undefined;
  if (t.mode === "range" && t.low != null && t.high != null) {
    const low = t.low;
    const high = t.high;
    const isZoneRange =
      Number.isInteger(low) &&
      Number.isInteger(high) &&
      low >= 1 &&
      low <= 7 &&
      high >= 1 &&
      high <= 7;
    if (!isZoneRange) return (low + high) / 2;
  }
  return undefined;
}

function leafPlanningExtras(step: LeafStep): Pick<
  FlatPlanningStep,
  "distanceMeters" | "targetSpeedMps" | "targetPaceSeconds"
> {
  const pace = paceSecondsFromLeafTarget(step);
  return {
    ...(step.distanceMeters ? { distanceMeters: step.distanceMeters } : {}),
    ...(step.targetSpeedMps ? { targetSpeedMps: step.targetSpeedMps } : {}),
    ...(pace ? { targetPaceSeconds: pace } : {}),
  };
}

export function leafToFlatPlanningStep(step: LeafStep): FlatPlanningStep | null {
  const type = INTENSITY_TO_LEGACY[step.intensity];
  const targetZone = targetZoneFromTarget(step.target);
  const extras = leafPlanningExtras(step);
  if (step.duration.type === "distance") {
    return {
      type,
      durationMinutes: 0,
      durationSeconds: 0,
      targetZone,
      distanceMeters: step.duration.value,
      openDuration: false,
      ...extras,
    };
  }
  if (step.duration.type === "open") {
    const sec = step.duration.estimateSeconds ?? 0;
    return {
      type,
      durationMinutes: sec > 0 ? Math.max(1, Math.round(sec / 60)) : 0,
      durationSeconds: sec,
      targetZone,
      openDuration: true,
      ...extras,
    };
  }
  const durationSeconds = step.duration.value;
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  return {
    type,
    durationMinutes,
    durationSeconds,
    targetZone,
    openDuration: false,
    ...extras,
  };
}

function rampToFlatPlanningSteps(step: RampStep): FlatPlanningStep[] {
  const zone =
    step.target.lowZone != null && step.target.highZone != null
      ? rampMidpointZone(step.target.lowZone, step.target.highZone)
      : rampMidpointZone(step.target.low, step.target.high);
  const durationSeconds = rampDurationSeconds(step);
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  return [
    {
      type: "steady",
      durationMinutes,
      durationSeconds,
      targetZone: zone,
      openDuration: false,
    },
  ];
}

export function flattenNodeForPlanning(node: WorkoutNode): FlatPlanningStep[] {
  if (node.kind === "step") {
    const flat = leafToFlatPlanningStep(node);
    return flat ? [flat] : [];
  }
  if (node.kind === "ramp") return rampToFlatPlanningSteps(node);
  const out: FlatPlanningStep[] = [];
  for (let i = 0; i < node.repeatCount; i++) {
    for (const child of node.children) {
      out.push(...flattenNodeForPlanning(child));
    }
  }
  return out;
}

export function flattenForPlanning(nodes: WorkoutNode[]): FlatPlanningStep[] {
  return nodes.flatMap(flattenNodeForPlanning);
}

export function flatPlanningToLegacySteps(flat: FlatPlanningStep[]): WorkoutStep[] {
  return flat
    .filter((s) => s.durationMinutes > 0 || (s.openDuration && s.durationSeconds > 0))
    .map((s) => ({
      type: s.type,
      durationMinutes: s.durationMinutes > 0 ? s.durationMinutes : Math.max(1, Math.round(s.durationSeconds / 60)),
      targetZone: s.targetZone,
      ...(s.distanceMeters ? { distanceMeters: s.distanceMeters } : {}),
      ...(s.targetSpeedMps ? { targetSpeedMps: s.targetSpeedMps } : {}),
      ...(s.targetPaceSeconds ? { targetPaceSeconds: s.targetPaceSeconds } : {}),
    }));
}

export function flattenTreeToLegacySteps(raw: unknown): WorkoutStep[] {
  const tree = parseWorkoutTree(raw);
  const flat = flattenForPlanning(tree.nodes);
  return flatPlanningToLegacySteps(flat);
}

export function rollupFlatPlanningToZoneMinutes(flat: FlatPlanningStep[]): ZoneMinutes {
  const totals: ZoneMinutes = {};
  for (const step of flat) {
    if (step.type === "rest") continue;
    if (step.durationMinutes <= 0 && !step.openDuration) continue;
    const key = String(step.targetZone);
    totals[key] = (totals[key] ?? 0) + (step.durationMinutes > 0 ? step.durationMinutes : 0);
  }
  return totals;
}

export function rollupTreeToZoneMinutes(raw: unknown): ZoneMinutes {
  const tree = parseWorkoutTree(raw);
  return rollupFlatPlanningToZoneMinutes(flattenForPlanning(tree.nodes));
}

export function totalTreeDurationSeconds(nodes: WorkoutNode[]): number {
  return flattenForPlanning(nodes).reduce((sum, s) => sum + s.durationSeconds, 0);
}

export function totalTreeDurationMinutes(nodes: WorkoutNode[]): number {
  const sec = totalTreeDurationSeconds(nodes);
  return sec > 0 ? Math.max(1, Math.round(sec / 60)) : 0;
}

export function defaultLeafStep(): LeafStep {
  return {
    kind: "step",
    intensity: "active",
    duration: { type: "time", value: 600 },
    target: { signal: "power", mode: "zone", zone: 2 },
  };
}

export function defaultRepeatBlock(): RepeatBlock {
  return {
    kind: "repeat",
    repeatCount: 4,
    children: [
      {
        kind: "step",
        intensity: "interval",
        duration: { type: "time", value: 240 },
        target: { signal: "power", mode: "zone", zone: 4 },
      },
      {
        kind: "step",
        intensity: "recovery",
        duration: { type: "time", value: 240 },
        target: { signal: "power", mode: "zone", zone: 2 },
      },
    ],
  };
}

export function defaultRampStep(): RampStep {
  return {
    kind: "ramp",
    duration: { type: "time", value: 600 },
    target: { signal: "power", low: 2, high: 4, lowZone: 2, highZone: 4 },
  };
}

export function intensityLabel(intensity: StepIntensity): string {
  const labels: Record<StepIntensity, string> = {
    warmup: "Warm up",
    active: "Steady",
    recovery: "Recovery",
    rest: "Rest",
    cooldown: "Cool down",
    interval: "Interval",
  };
  return labels[intensity];
}

export function formatDurationSeconds(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
  return `${s}s`;
}

/** Editor display: always H:MM:SS (e.g. 0:09:30). */
export function formatDurationHms(seconds: number): string {
  if (seconds <= 0) return "0:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Parse editor duration input.
 * Plain numbers (including decimals) are minutes; colon forms are mm:ss or h:mm:ss.
 */
export function parseDurationInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const minutes = Number(trimmed);
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
  }
  const parts = trimmed.split(":").map((p) => Number(p.trim()));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function normalizeStepsPayload(raw: unknown): WorkoutTreeDocument {
  return parseWorkoutTree(raw);
}

export function primarySignalForDiscipline(discipline: Discipline): TargetSignal {
  if (discipline === "RUN") return "pace";
  if (discipline === "SWIM") return "pace";
  if (discipline === "STRENGTH") return "heart_rate";
  return "power";
}

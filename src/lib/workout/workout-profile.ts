import type { Discipline, SignalType } from "@prisma/client";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { formatPace } from "@/lib/units/pace";
import { paceSecondsAtZoneMidpoint, zoneMidSpeedPct } from "@/lib/workout/zone-pace";
import type {
  LeafStep,
  RampStep,
  StepTarget,
  WorkoutNode,
} from "@/lib/workout/workout-tree";
import { swimIntervalToRepeatBlock } from "@/lib/workout/swim-interval-set";
import { targetZoneFromTarget } from "@/lib/workout/workout-tree";

export type ProfileLengthView = "duration" | "distance";

export type WorkoutProfileSegment = {
  id: string;
  label: string;
  x: number;
  width: number;
  yLow: number;
  yHigh: number;
  fill: string;
};

export type WorkoutProfileChart = {
  segments: WorkoutProfileSegment[];
  totalX: number;
  yMin: number;
  yMax: number;
  yLabel: string;
  xLabel: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
};

export type WorkoutProfileThresholds = {
  thresholdPaceSeconds?: number | null;
  thresholdFtpWatts?: number | null;
  thresholdHrBpm?: number | null;
};

const METERS_PER_KM = 1000;
const METERS_PER_100M = 100;

const FALLBACK_PACE: Record<"RUN" | "SWIM", number> = {
  RUN: 300,
  SWIM: 90,
};

const FALLBACK_FTP = 200;

const INTENSITY_FILL: Record<string, string> = {
  warmup: "#38bdf8",
  active: "#3b82f6",
  interval: "#f97316",
  recovery: "#86efac",
  rest: "#a1a1aa",
  cooldown: "#a78bfa",
  ramp: "#f59e0b",
};

const ZONE_FILL: Record<number, string> = {
  1: "#bae6fd",
  2: "#38bdf8",
  3: "#fbbf24",
  4: "#f97316",
  5: "#ef4444",
  6: "#dc2626",
  7: "#991b1b",
};

const HR_ZONE_FILL: Record<number, string> = {
  1: "#bae6fd",
  2: "#38bdf8",
  3: "#fbbf24",
  4: "#f97316",
  5: "#ef4444",
};

function isZoneRange(target: StepTarget): boolean {
  if (target.mode !== "range" || target.low == null || target.high == null) return false;
  return (
    Number.isInteger(target.low) &&
    Number.isInteger(target.high) &&
    target.low >= 1 &&
    target.low <= 7 &&
    target.high >= 1 &&
    target.high <= 7
  );
}

function wattsAtZoneMidpoint(zone: number, ftp: number): number {
  const boundaries = zoneBoundariesFor("BIKE", "POWER");
  const pct = zoneMidSpeedPct(zone, boundaries);
  return (ftp * pct) / 100;
}

/** Higher Y = faster pace (inverted seconds). */
function paceToInvertedY(paceSeconds: number): number {
  if (paceSeconds <= 0) return 0;
  return -paceSeconds;
}

function paceSecondsFromLeaf(
  step: LeafStep,
  discipline: Discipline,
  thresholdPaceSeconds?: number | null
): number | null {
  if (step.targetPaceSeconds != null && step.targetPaceSeconds > 0) {
    return step.targetPaceSeconds;
  }
  const t = step.target;
  if (t.mode === "value" && t.value != null && t.value > 0 && (t.signal === "pace" || t.signal === "speed")) {
    return t.value;
  }
  if (t.mode === "range" && t.low != null && t.high != null && !isZoneRange(t)) {
    return (t.low + t.high) / 2;
  }
  if (discipline === "RUN" || discipline === "SWIM") {
    const zone = targetZoneFromTarget(t);
    const threshold =
      thresholdPaceSeconds && thresholdPaceSeconds > 0
        ? thresholdPaceSeconds
        : FALLBACK_PACE[discipline];
    return paceSecondsAtZoneMidpoint(zone, threshold);
  }
  return null;
}

function hrZoneFromStep(step: LeafStep): number {
  const t = step.target;
  if (t.signal === "heart_rate") {
    if (t.mode === "range" && t.low != null && t.high != null) {
      return Math.round((t.low + t.high) / 2);
    }
    if (t.zone != null) return Math.max(1, Math.min(5, t.zone));
    if (t.mode === "value" && t.value != null && t.value >= 1 && t.value <= 5) {
      return Math.round(t.value);
    }
  }
  if (t.mode === "zone" && t.zone != null) {
    return Math.max(1, Math.min(5, t.zone));
  }
  if (t.mode === "range" && isZoneRange(t) && t.signal !== "power" && t.signal !== "pace" && t.signal !== "speed") {
    return Math.max(1, Math.min(5, Math.round((t.low! + t.high!) / 2)));
  }
  // Absolute power/pace values are not HR zones — avoid clamping watts into Z5.
  return 2;
}

/** True when the step is prescribed on power/pace, not HR zones. */
function stepUsesNativeNonHrTarget(step: LeafStep): boolean {
  const signal = step.target.signal;
  return signal === "power" || signal === "pace" || signal === "speed";
}

function planningZoneFromTarget(target: StepTarget): number {
  // Absolute watt/pace values are not zone indices — targetZoneFromTarget would
  // clamp 250W to 7. Only trust zone-like targets here.
  if (target.mode === "zone" && target.zone != null) return target.zone;
  if (isZoneRange(target)) {
    return Math.round((target.low! + target.high!) / 2);
  }
  if (target.signal === "heart_rate") {
    if (target.zone != null) return Math.max(1, Math.min(5, target.zone));
    if (target.mode === "value" && target.value != null && target.value >= 1 && target.value <= 5) {
      return Math.round(target.value);
    }
  }
  return targetZoneFromTarget(
    target.mode === "value" && target.value != null && target.value > 7
      ? { signal: target.signal, mode: "zone", zone: 2 }
      : target
  );
}

function resolveLeafY(
  step: LeafStep,
  primarySignal: SignalType,
  discipline: Discipline,
  thresholds: WorkoutProfileThresholds
): { low: number; high: number; fill: string } {
  const t = step.target;
  const baseFill = INTENSITY_FILL[step.intensity] ?? INTENSITY_FILL.active;
  const zone = planningZoneFromTarget(t);
  const zoneFill = ZONE_FILL[zone] ?? baseFill;

  // When TiZ primary is HR but the step is power/pace-valued, render on the
  // native axis so interval structure stays visible (don't treat watts as zones).
  const effectiveSignal: SignalType =
    primarySignal === "HEART_RATE" && stepUsesNativeNonHrTarget(step)
      ? t.signal === "power"
        ? "POWER"
        : "PACE"
      : primarySignal;

  if (effectiveSignal === "HEART_RATE") {
    if (t.mode === "range" && t.low != null && t.high != null && t.signal === "heart_rate") {
      const low = Math.max(1, Math.min(5, Math.round(t.low)));
      const high = Math.max(1, Math.min(5, Math.round(t.high)));
      return {
        low: Math.min(low, high),
        high: Math.max(low, high),
        fill: HR_ZONE_FILL[Math.round((low + high) / 2)] ?? baseFill,
      };
    }
    const hrZone = hrZoneFromStep(step);
    return { low: hrZone, high: hrZone, fill: HR_ZONE_FILL[hrZone] ?? baseFill };
  }

  if (effectiveSignal === "POWER" && discipline === "BIKE") {
    const ftp =
      thresholds.thresholdFtpWatts && thresholds.thresholdFtpWatts > 0
        ? thresholds.thresholdFtpWatts
        : FALLBACK_FTP;
    if (t.mode === "range" && t.low != null && t.high != null && t.signal === "power") {
      return {
        low: Math.min(t.low, t.high),
        high: Math.max(t.low, t.high),
        fill: baseFill,
      };
    }
    if (t.mode === "value" && t.value != null && t.signal === "power") {
      return { low: t.value, high: t.value, fill: baseFill };
    }
    const watts = wattsAtZoneMidpoint(zone, ftp);
    return { low: watts, high: watts, fill: zoneFill };
  }

  if (effectiveSignal === "PACE" && (discipline === "RUN" || discipline === "SWIM")) {
    if (t.mode === "range" && t.low != null && t.high != null && !isZoneRange(t)) {
      const fast = Math.min(t.low, t.high);
      const slow = Math.max(t.low, t.high);
      return {
        low: paceToInvertedY(slow),
        high: paceToInvertedY(fast),
        fill: baseFill,
      };
    }
    const pace =
      paceSecondsFromLeaf(step, discipline, thresholds.thresholdPaceSeconds) ??
      FALLBACK_PACE[discipline];
    const y = paceToInvertedY(pace);
    return { low: y, high: y, fill: zoneFill };
  }

  if (effectiveSignal === "POWER") {
    const watts = t.mode === "value" && t.value != null ? t.value : zone * 30 + 140;
    return { low: watts, high: watts, fill: zoneFill };
  }

  const hrZone = hrZoneFromStep(step);
  return { low: hrZone, high: hrZone, fill: HR_ZONE_FILL[hrZone] ?? zoneFill };
}

function resolveRampY(
  step: RampStep,
  primarySignal: SignalType,
  discipline: Discipline,
  thresholds: WorkoutProfileThresholds
): { low: number; high: number } {
  const effectiveSignal: SignalType =
    primarySignal === "HEART_RATE" &&
    (step.target.signal === "power" ||
      step.target.signal === "pace" ||
      step.target.signal === "speed")
      ? step.target.signal === "power"
        ? "POWER"
        : "PACE"
      : primarySignal;

  if (effectiveSignal === "HEART_RATE") {
    const lowZ = step.target.lowZone ?? Math.round(step.target.low);
    const highZ = step.target.highZone ?? Math.round(step.target.high);
    return { low: Math.min(lowZ, highZ), high: Math.max(lowZ, highZ) };
  }

  if (effectiveSignal === "POWER" && discipline === "BIKE") {
    return {
      low: Math.min(step.target.low, step.target.high),
      high: Math.max(step.target.low, step.target.high),
    };
  }

  if (effectiveSignal === "PACE" && (discipline === "RUN" || discipline === "SWIM")) {
    const fast = Math.min(step.target.low, step.target.high);
    const slow = Math.max(step.target.low, step.target.high);
    return {
      low: paceToInvertedY(slow),
      high: paceToInvertedY(fast),
    };
  }

  const lowZ = step.target.lowZone ?? Math.round(step.target.low);
  const highZ = step.target.highZone ?? Math.round(step.target.high);
  return { low: Math.min(lowZ, highZ), high: Math.max(lowZ, highZ) };
}

function leafDurationSeconds(step: LeafStep): number {
  if (step.duration.type === "time") return step.duration.value;
  if (step.duration.type === "open") return step.duration.estimateSeconds ?? 0;
  return 0;
}

function leafDistanceMeters(
  step: LeafStep,
  discipline: Discipline,
  thresholdPaceSeconds?: number | null
): number {
  if (step.duration.type === "distance") return step.duration.value;
  const sec = leafDurationSeconds(step);
  const pace = paceSecondsFromLeaf(step, discipline, thresholdPaceSeconds);
  if (!sec || !pace) return 0;
  if (discipline === "SWIM") return (sec / pace) * METERS_PER_100M;
  if (discipline === "RUN") return (sec / pace) * METERS_PER_KM;
  return 0;
}

function leafXSize(
  step: LeafStep,
  lengthView: ProfileLengthView,
  discipline: Discipline,
  thresholdPaceSeconds?: number | null
): number {
  if (lengthView === "distance") {
    const meters = leafDistanceMeters(step, discipline, thresholdPaceSeconds);
    return meters > 0 ? meters : 0;
  }
  if (step.duration.type === "distance") {
    const pace = paceSecondsFromLeaf(step, discipline, thresholdPaceSeconds);
    if (!pace) return 0;
    if (discipline === "SWIM") return (step.duration.value / METERS_PER_100M) * pace;
    if (discipline === "RUN") return (step.duration.value / METERS_PER_KM) * pace;
    return step.duration.value / 5;
  }
  const sec = leafDurationSeconds(step);
  return sec > 0 ? sec : 0;
}

function formatDurationAxis(seconds: number): string {
  if (seconds <= 0) return "0";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

function formatDistanceAxis(meters: number, discipline: Discipline): string {
  if (meters <= 0) return "0";
  if (discipline === "SWIM") {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
    return `${Math.round(meters)}m`;
  }
  if (meters >= METERS_PER_KM) return `${(meters / METERS_PER_KM).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

function formatPaceAxisValue(
  invertedY: number,
  discipline: "RUN" | "SWIM",
  displayUnit: "METRIC" | "IMPERIAL"
): string {
  const paceSeconds = -invertedY;
  if (paceSeconds <= 0) return "—";
  if (discipline === "SWIM") {
    return `${formatPace(paceSeconds, displayUnit === "METRIC" ? "100m" : "100yd")}`;
  }
  return `${formatPace(paceSeconds, displayUnit === "METRIC" ? "km" : "mi")}`;
}

const RAMP_SLICES = 10;

function appendNode(
  node: WorkoutNode,
  segments: WorkoutProfileSegment[],
  xCursor: number,
  primarySignal: SignalType,
  lengthView: ProfileLengthView,
  discipline: Discipline,
  thresholds: WorkoutProfileThresholds,
  idPrefix: string
): number {
  if (node.kind === "repeat" || node.kind === "swim_interval") {
    const repeatNode =
      node.kind === "swim_interval"
        ? swimIntervalToRepeatBlock(node, thresholds.thresholdPaceSeconds)
        : node;
    let x = xCursor;
    for (let r = 0; r < repeatNode.repeatCount; r++) {
      for (let c = 0; c < repeatNode.children.length; c++) {
        x = appendNode(
          repeatNode.children[c],
          segments,
          x,
          primarySignal,
          lengthView,
          discipline,
          thresholds,
          `${idPrefix}-r${r}-c${c}`
        );
      }
    }
    return x;
  }

  if (node.kind === "ramp") {
    const duration = node.duration.value;
    const xUnit =
      lengthView === "distance"
        ? leafDistanceMeters(
            {
              kind: "step",
              intensity: "active",
              duration: { type: "time", value: duration },
              target: { signal: "power", mode: "zone", zone: 2 },
            },
            discipline,
            thresholds.thresholdPaceSeconds
          )
        : duration;
    const sliceX = xUnit / RAMP_SLICES;
    const { low, high } = resolveRampY(node, primarySignal, discipline, thresholds);
    for (let i = 0; i < RAMP_SLICES; i++) {
      const t0 = i / RAMP_SLICES;
      const t1 = (i + 1) / RAMP_SLICES;
      const yLow = low + (high - low) * t0;
      const yHigh = low + (high - low) * t1;
      if (sliceX <= 0) continue;
      segments.push({
        id: `${idPrefix}-ramp-${i}`,
        label: "Ramp",
        x: xCursor + i * sliceX,
        width: sliceX,
        yLow: Math.min(yLow, yHigh),
        yHigh: Math.max(yLow, yHigh),
        fill: INTENSITY_FILL.ramp,
      });
    }
    return xCursor + xUnit;
  }

  const width = leafXSize(node, lengthView, discipline, thresholds.thresholdPaceSeconds);
  if (width <= 0) return xCursor;
  const { low, high, fill } = resolveLeafY(node, primarySignal, discipline, thresholds);
  segments.push({
    id: idPrefix,
    label: node.intensity,
    x: xCursor,
    width,
    yLow: Math.min(low, high),
    yHigh: Math.max(low, high),
    fill,
  });
  return xCursor + width;
}

export function defaultPrimarySignalForDiscipline(discipline: Discipline): SignalType {
  if (discipline === "BIKE") return "POWER";
  if (discipline === "RUN" || discipline === "SWIM") return "PACE";
  return "HEART_RATE";
}

/** Prefer prescribed target axis when TiZ primary is HR but steps are power/pace. */
function profileSignalForNodes(
  nodes: WorkoutNode[],
  primarySignal: SignalType,
  discipline: Discipline
): SignalType {
  if (primarySignal !== "HEART_RATE") return primarySignal;

  let sawPower = false;
  let sawPace = false;
  let sawHr = false;

  function walk(list: WorkoutNode[]): void {
    for (const node of list) {
      if (node.kind === "repeat") {
        walk(node.children);
        continue;
      }
      if (node.kind === "swim_interval") {
        const signal = node.target.signal;
        if (signal === "power") sawPower = true;
        else if (signal === "pace" || signal === "speed") sawPace = true;
        else if (signal === "heart_rate") sawHr = true;
        continue;
      }
      if (node.kind === "ramp") {
        if (node.target.signal === "power") sawPower = true;
        else if (node.target.signal === "pace" || node.target.signal === "speed") sawPace = true;
        else if (node.target.signal === "heart_rate") sawHr = true;
        continue;
      }
      if (node.target.signal === "power") sawPower = true;
      else if (node.target.signal === "pace" || node.target.signal === "speed") sawPace = true;
      else if (node.target.signal === "heart_rate") sawHr = true;
    }
  }
  walk(nodes);

  if (sawHr && !sawPower && !sawPace) return "HEART_RATE";
  if (sawPower && (discipline === "BIKE" || !sawPace)) return "POWER";
  if (sawPace && (discipline === "RUN" || discipline === "SWIM")) return "PACE";
  if (sawPower) return "POWER";
  return primarySignal;
}

export function buildWorkoutProfile(
  nodes: WorkoutNode[],
  options: {
    primarySignal: SignalType;
    lengthView: ProfileLengthView;
    discipline: Discipline;
    displayUnit?: "METRIC" | "IMPERIAL";
    thresholds?: WorkoutProfileThresholds;
  }
): WorkoutProfileChart {
  const {
    primarySignal: requestedSignal,
    lengthView,
    discipline,
    displayUnit = "METRIC",
    thresholds = {},
  } = options;
  const primarySignal = profileSignalForNodes(nodes, requestedSignal, discipline);

  const segments: WorkoutProfileSegment[] = [];
  let x = 0;
  nodes.forEach((node, i) => {
    x = appendNode(
      node,
      segments,
      x,
      primarySignal,
      lengthView,
      discipline,
      thresholds,
      `n${i}`
    );
  });

  const totalX = segments.reduce((sum, s) => sum + s.width, 0) || 1;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of segments) {
    yMin = Math.min(yMin, s.yLow);
    yMax = Math.max(yMax, s.yHigh);
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  const pad = (yMax - yMin) * 0.08 || 0.5;
  yMin -= pad;
  yMax += pad;

  const xLabel = lengthView === "distance" ? "Distance" : "Duration";
  const formatX =
    lengthView === "distance"
      ? (v: number) => formatDistanceAxis(v, discipline)
      : formatDurationAxis;

  let yLabel = "Zone";
  let formatY = (v: number) => `Z${Math.round(v)}`;

  if (primarySignal === "HEART_RATE") {
    yLabel = "HR zone";
    formatY = (v: number) => `HR ${Math.round(v)}`;
  } else if (primarySignal === "POWER") {
    yLabel = "Power (W)";
    formatY = (v: number) => `${Math.round(v)} W`;
    yMin = Math.max(0, yMin);
  } else if (primarySignal === "PACE" && (discipline === "RUN" || discipline === "SWIM")) {
    yLabel = discipline === "RUN" ? "Pace" : "Pace /100m";
    formatY = (v: number) =>
      formatPaceAxisValue(v, discipline, displayUnit);
  }

  return {
    segments,
    totalX,
    yMin,
    yMax,
    yLabel,
    xLabel,
    formatX,
    formatY,
  };
}

export type ExecutionProfileBand = {
  label: string;
  groupLabel: string | null;
  yLow: number;
  yHigh: number;
  fill: string;
  plannedSeconds: number;
  plannedDistanceM: number;
  openDuration: boolean;
};

function hasRepeatInTree(nodes: WorkoutNode[]): boolean {
  for (const node of nodes) {
    if (node.kind === "repeat" || node.kind === "swim_interval") return true;
  }
  return false;
}

/** One profile band per execution occurrence (matches expandExecutionOccurrences row order). */
export function collectExecutionProfileBands(
  nodes: WorkoutNode[],
  discipline: Discipline,
  primarySignal: SignalType,
  thresholds: WorkoutProfileThresholds = {}
): ExecutionProfileBand[] {
  const bands: ExecutionProfileBand[] = [];
  const useGroups = hasRepeatInTree(nodes);

  function walk(nodeList: WorkoutNode[], groupLabel: string | null): void {
    for (const node of nodeList) {
      if (node.kind === "repeat" || node.kind === "swim_interval") {
        const repeatNode =
          node.kind === "swim_interval"
            ? swimIntervalToRepeatBlock(node, thresholds.thresholdPaceSeconds)
            : node;
        for (let r = 0; r < repeatNode.repeatCount; r++) {
          const roundLabel = useGroups ? `Interval ${r + 1}` : null;
          walk(repeatNode.children, roundLabel);
        }
        continue;
      }
      if (node.kind === "ramp") {
        const { low, high } = resolveRampY(node, primarySignal, discipline, thresholds);
        bands.push({
          label: "Ramp",
          groupLabel,
          yLow: Math.min(low, high),
          yHigh: Math.max(low, high),
          fill: INTENSITY_FILL.ramp,
          plannedSeconds: node.duration.value,
          plannedDistanceM: leafDistanceMeters(
            {
              kind: "step",
              intensity: "active",
              duration: { type: "time", value: node.duration.value },
              target: { signal: "power", mode: "zone", zone: 2 },
            },
            discipline,
            thresholds.thresholdPaceSeconds
          ),
          openDuration: false,
        });
        continue;
      }
      const { low, high, fill } = resolveLeafY(node, primarySignal, discipline, thresholds);
      bands.push({
        label: node.intensity,
        groupLabel,
        yLow: Math.min(low, high),
        yHigh: Math.max(low, high),
        fill,
        plannedSeconds: leafDurationSeconds(node),
        plannedDistanceM: leafDistanceMeters(node, discipline, thresholds.thresholdPaceSeconds),
        openDuration: node.duration.type === "open",
      });
    }
  }

  walk(nodes, null);
  return bands;
}

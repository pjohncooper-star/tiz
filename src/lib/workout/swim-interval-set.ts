import type { PoolSize } from "@prisma/client";
import { zoneBoundariesFor } from "@/lib/thresholds/zones";
import { enrichDistanceFlatStep, type DistanceDurationOptions } from "@/lib/workout/distance-duration";
import type { DisplayUnit } from "@/lib/workout/metrics";
import { paceSecondsAtZoneMidpoint } from "@/lib/workout/zone-pace";
import type {
  FlatPlanningStep,
  LeafStep,
  RepeatBlock,
  StepTarget,
  SwimIntervalSet,
} from "@/lib/workout/workout-tree";

const METERS_PER_100M = 100;
const YARDS_PER_METER = 1 / 0.9144;
const FALLBACK_SWIM_PACE_SECONDS = 90;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseTarget(raw: unknown): StepTarget {
  if (!isRecord(raw)) {
    return { signal: "pace", mode: "zone", zone: 4 };
  }
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
        : "pace",
    mode: mode === "range" || mode === "value" ? mode : "zone",
    ...(Number.isInteger(zone) && zone >= 1 && zone <= 7 ? { zone } : {}),
    ...(Number.isFinite(low) ? { low } : {}),
    ...(Number.isFinite(high) ? { high } : {}),
    ...(Number.isFinite(value) ? { value } : {}),
  };
}

function targetZoneFromTargetLocal(target: StepTarget): number {
  if (target.mode === "zone" && target.zone) return target.zone;
  if (target.mode === "range" && target.low != null && target.high != null) {
    return Math.round((target.low + target.high) / 2);
  }
  if (target.value != null) return Math.max(1, Math.min(7, Math.round(target.value)));
  return 2;
}

function formatClockDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
  return `${s}s`;
}

function swimLeafToFlat(
  step: LeafStep,
  options: DistanceDurationOptions = {}
): FlatPlanningStep {
  const targetZone = targetZoneFromTargetLocal(step.target);
  if (step.duration.type === "distance") {
    const flat: FlatPlanningStep = {
      type: step.intensity === "recovery" || step.intensity === "rest" ? "rest" : "steady",
      durationMinutes: 0,
      durationSeconds: 0,
      targetZone,
      distanceMeters: step.duration.value,
      openDuration: false,
      ...(step.targetPaceSeconds ? { targetPaceSeconds: step.targetPaceSeconds } : {}),
    };
    return enrichDistanceFlatStep(flat, { ...options, discipline: "SWIM" });
  }
  const durationSeconds = step.duration.type === "time" ? step.duration.value : 0;
  return {
    type: step.intensity === "recovery" || step.intensity === "rest" ? "rest" : "steady",
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    durationSeconds,
    targetZone,
    openDuration: false,
    ...(step.targetPaceSeconds ? { targetPaceSeconds: step.targetPaceSeconds } : {}),
  };
}

export function defaultSwimIntervalSet(): SwimIntervalSet {
  return {
    kind: "swim_interval",
    repeatCount: 10,
    distanceMeters: 100,
    restMode: "sendoff",
    sendOffSeconds: 90,
    target: { signal: "pace", mode: "zone", zone: 4 },
  };
}

export function parseSwimIntervalSet(raw: Record<string, unknown>): SwimIntervalSet | null {
  const repeatCount = Number(raw.repeatCount);
  const distanceMeters = Number(raw.distanceMeters);
  const restMode = raw.restMode;
  if (!Number.isInteger(repeatCount) || repeatCount < 1) return null;
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (restMode !== "sendoff" && restMode !== "fixed") return null;

  const sendOffSeconds = Number(raw.sendOffSeconds);
  const fixedRestSeconds = Number(raw.fixedRestSeconds);
  const targetPaceSeconds = Number(raw.targetPaceSeconds);

  const set: SwimIntervalSet = {
    kind: "swim_interval",
    repeatCount,
    distanceMeters,
    restMode,
    target: parseTarget(raw.target),
    ...(Number.isFinite(sendOffSeconds) && sendOffSeconds > 0 ? { sendOffSeconds } : {}),
    ...(Number.isFinite(fixedRestSeconds) && fixedRestSeconds > 0 ? { fixedRestSeconds } : {}),
    ...(Number.isFinite(targetPaceSeconds) && targetPaceSeconds > 0 ? { targetPaceSeconds } : {}),
    ...(typeof raw.notes === "string" && raw.notes.trim() ? { notes: raw.notes.trim() } : {}),
  };

  if (set.restMode === "sendoff" && (set.sendOffSeconds == null || set.sendOffSeconds <= 0)) {
    return null;
  }
  if (set.restMode === "fixed" && (set.fixedRestSeconds == null || set.fixedRestSeconds <= 0)) {
    return null;
  }

  return set;
}

export function resolveSwimIntervalPaceSeconds(
  set: SwimIntervalSet,
  thresholdPaceSeconds?: number | null
): number {
  if (set.targetPaceSeconds != null && set.targetPaceSeconds > 0) {
    return set.targetPaceSeconds;
  }
  const threshold =
    thresholdPaceSeconds != null && thresholdPaceSeconds > 0
      ? thresholdPaceSeconds
      : FALLBACK_SWIM_PACE_SECONDS;
  const zone = targetZoneFromTargetLocal(set.target);
  if (zone >= 1) {
    const pace = paceSecondsAtZoneMidpoint(
      zone,
      threshold,
      zoneBoundariesFor("SWIM", "PACE")
    );
    if (pace > 0) return pace;
  }
  return threshold;
}

export function swimIntervalSwimTimeSeconds(
  set: SwimIntervalSet,
  thresholdPaceSeconds?: number | null
): number {
  const pace = resolveSwimIntervalPaceSeconds(set, thresholdPaceSeconds);
  return (set.distanceMeters / METERS_PER_100M) * pace;
}

export function swimIntervalRestSeconds(
  set: SwimIntervalSet,
  thresholdPaceSeconds?: number | null
): number {
  if (set.restMode === "fixed") {
    return set.fixedRestSeconds ?? 0;
  }
  const swimTime = swimIntervalSwimTimeSeconds(set, thresholdPaceSeconds);
  const sendOff = set.sendOffSeconds ?? 0;
  return Math.max(0, sendOff - swimTime);
}

export function swimIntervalSetDurationSeconds(
  set: SwimIntervalSet,
  thresholdPaceSeconds?: number | null
): number {
  if (set.restMode === "sendoff") {
    return set.repeatCount * (set.sendOffSeconds ?? 0);
  }
  const swimTime = swimIntervalSwimTimeSeconds(set, thresholdPaceSeconds);
  const rest = set.fixedRestSeconds ?? 0;
  return set.repeatCount * (swimTime + rest);
}

function swimIntervalWorkLeaf(set: SwimIntervalSet): LeafStep {
  return {
    kind: "step",
    intensity: "interval",
    duration: { type: "distance", value: set.distanceMeters },
    target: set.target,
    ...(set.targetPaceSeconds ? { targetPaceSeconds: set.targetPaceSeconds } : {}),
  };
}

function swimIntervalRestLeaf(restSeconds: number): LeafStep {
  return {
    kind: "step",
    intensity: "recovery",
    duration: { type: "time", value: restSeconds },
    target: { signal: "pace", mode: "zone", zone: 1 },
  };
}

export function swimIntervalToRepeatBlock(
  set: SwimIntervalSet,
  thresholdPaceSeconds?: number | null
): RepeatBlock {
  const restSeconds = swimIntervalRestSeconds(set, thresholdPaceSeconds);
  const children: LeafStep[] = [swimIntervalWorkLeaf(set)];
  if (restSeconds > 0) {
    children.push(swimIntervalRestLeaf(restSeconds));
  }
  return {
    kind: "repeat",
    repeatCount: set.repeatCount,
    children,
    ...(set.notes ? { notes: set.notes } : {}),
  };
}

export function swimIntervalToFlatSteps(
  set: SwimIntervalSet,
  thresholdOrOptions?: number | null | DistanceDurationOptions
): FlatPlanningStep[] {
  const options: DistanceDurationOptions =
    thresholdOrOptions == null
      ? {}
      : typeof thresholdOrOptions === "number"
        ? { thresholdPaceSeconds: thresholdOrOptions, discipline: "SWIM" }
        : { ...thresholdOrOptions, discipline: "SWIM" };
  const block = swimIntervalToRepeatBlock(set, options.thresholdPaceSeconds);
  const out: FlatPlanningStep[] = [];
  for (let i = 0; i < block.repeatCount; i++) {
    for (const child of block.children) {
      if (child.kind === "step") out.push(swimLeafToFlat(child, options));
    }
  }
  return out;
}

function swimIntervalDisplayDistance(
  set: SwimIntervalSet,
  poolSize: PoolSize | null,
  displayUnit: DisplayUnit
): number {
  const useYards = poolSize === "SCY" || displayUnit === "IMPERIAL";
  if (useYards) {
    return Math.round(set.distanceMeters * YARDS_PER_METER);
  }
  return Math.round(set.distanceMeters);
}

export function formatSwimIntervalLabel(
  set: SwimIntervalSet,
  poolSize: PoolSize | null,
  displayUnit: DisplayUnit
): string {
  const distance = swimIntervalDisplayDistance(set, poolSize, displayUnit);
  const useYards = poolSize === "SCY" || displayUnit === "IMPERIAL";
  const distanceLabel = useYards ? `${distance}` : `${distance}m`;
  const head = `${set.repeatCount}×${distanceLabel}`;

  if (set.restMode === "sendoff" && set.sendOffSeconds != null && set.sendOffSeconds > 0) {
    return `${head} on ${formatClockDuration(set.sendOffSeconds)}`;
  }
  if (set.restMode === "fixed" && set.fixedRestSeconds != null && set.fixedRestSeconds > 0) {
    return `${head} rest ${formatClockDuration(set.fixedRestSeconds)}`;
  }
  return head;
}


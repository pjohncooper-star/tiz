import type { Discipline, SignalType } from "@prisma/client";
import { assignEcoZone, ecoBoundariesForSignal } from "@/lib/eco/boundaries";
import type { EcoZoneMinutes } from "@/lib/eco/compute";
import {
  emptyEcoZoneMinutes,
  mapTizMinutesToEcoZones,
} from "@/lib/eco/tiz-eco-map";
import { swimIntervalToFlatSteps } from "@/lib/workout/swim-interval-set";
import {
  parseWorkoutTree,
  targetZoneFromTarget,
  type LeafStep,
  type RampStep,
  type StepTarget,
  type WorkoutNode,
} from "@/lib/workout/workout-tree";

/** Athlete thresholds used to map absolute planned targets into ECO zones. */
export type PlannedEcoThresholds = {
  ftpWatts?: number | null;
  lthrBpm?: number | null;
  /** Run: sec/km. Swim: sec/100m. */
  thresholdPaceSeconds?: number | null;
};

export function isZoneLookingRange(low: number, high: number): boolean {
  return (
    Number.isInteger(low) &&
    Number.isInteger(high) &&
    low >= 1 &&
    low <= 7 &&
    high >= 1 &&
    high <= 7
  );
}

function isRestIntensity(intensity: LeafStep["intensity"]): boolean {
  return intensity === "rest" || intensity === "recovery";
}

function leafDurationMinutes(step: LeafStep): number {
  if (step.duration.type === "time") {
    return step.duration.value > 0 ? step.duration.value / 60 : 0;
  }
  if (step.duration.type === "open") {
    const sec = step.duration.estimateSeconds ?? 0;
    return sec > 0 ? sec / 60 : 0;
  }
  // Distance-only: derive minutes when pace is known.
  if (step.duration.type === "distance" && step.duration.value > 0) {
    const pace = concretePaceSeconds(step);
    if (pace == null || !(pace > 0)) return 0;
    const meters = step.duration.value;
    // Swim CSS-like paces are typically ≤ 180 s/100m; run paces are s/km.
    if (pace <= 180) {
      return (meters / 100) * (pace / 60);
    }
    return (meters / 1000) * (pace / 60);
  }
  return 0;
}

function concretePaceSeconds(step: LeafStep): number | null {
  if (step.targetPaceSeconds != null && step.targetPaceSeconds > 0) {
    return step.targetPaceSeconds;
  }
  const t = step.target;
  if (t.signal !== "pace" && t.signal !== "speed") return null;
  if (t.mode === "value" && t.value != null && t.value > 0) return t.value;
  if (t.mode === "range" && t.low != null && t.high != null) {
    if (isZoneLookingRange(t.low, t.high)) return null;
    return (t.low + t.high) / 2;
  }
  return null;
}

type ConcreteSample = {
  signal: SignalType;
  value: number;
};

/**
 * Resolve absolute intensity for a step target when present.
 * Zone-mode and zone-looking ranges return null.
 */
export function resolveConcreteSample(
  target: StepTarget,
  extras?: { targetPaceSeconds?: number | null }
): ConcreteSample | null {
  if (target.signal === "open") return null;

  if (target.signal === "power") {
    if (target.mode === "value" && target.value != null && target.value > 0) {
      return { signal: "POWER", value: target.value };
    }
    if (target.mode === "range" && target.low != null && target.high != null) {
      if (isZoneLookingRange(target.low, target.high)) return null;
      return { signal: "POWER", value: (target.low + target.high) / 2 };
    }
    return null;
  }

  if (target.signal === "heart_rate") {
    if (target.mode === "value" && target.value != null && target.value > 0) {
      return { signal: "HEART_RATE", value: target.value };
    }
    if (target.mode === "range" && target.low != null && target.high != null) {
      if (isZoneLookingRange(target.low, target.high)) return null;
      return { signal: "HEART_RATE", value: (target.low + target.high) / 2 };
    }
    return null;
  }

  if (target.signal === "pace" || target.signal === "speed") {
    const pace =
      extras?.targetPaceSeconds != null && extras.targetPaceSeconds > 0
        ? extras.targetPaceSeconds
        : target.mode === "value" && target.value != null && target.value > 0
          ? target.value
          : target.mode === "range" &&
              target.low != null &&
              target.high != null &&
              !isZoneLookingRange(target.low, target.high)
            ? (target.low + target.high) / 2
            : null;
    if (pace != null && pace > 0) return { signal: "PACE", value: pace };
    return null;
  }

  return null;
}

function thresholdForSignal(
  signal: SignalType,
  thresholds: PlannedEcoThresholds
): number | null {
  if (signal === "POWER") {
    return thresholds.ftpWatts != null && thresholds.ftpWatts > 0
      ? thresholds.ftpWatts
      : null;
  }
  if (signal === "HEART_RATE") {
    return thresholds.lthrBpm != null && thresholds.lthrBpm > 0
      ? thresholds.lthrBpm
      : null;
  }
  if (signal === "PACE") {
    return thresholds.thresholdPaceSeconds != null &&
      thresholds.thresholdPaceSeconds > 0
      ? thresholds.thresholdPaceSeconds
      : null;
  }
  return null;
}

function addTizMinutesToEco(
  eco: EcoZoneMinutes,
  tizZone: number,
  minutes: number
): void {
  if (!(minutes > 0)) return;
  const z = Math.max(1, Math.min(5, Math.round(tizZone))) as 1 | 2 | 3 | 4 | 5;
  const mapped = mapTizMinutesToEcoZones({
    1: z === 1 ? minutes : 0,
    2: z === 2 ? minutes : 0,
    3: z === 3 ? minutes : 0,
    4: z === 4 ? minutes : 0,
    5: z === 5 ? minutes : 0,
  });
  for (let i = 1; i <= 8; i++) {
    eco[i] = (eco[i] ?? 0) + (mapped[i] ?? 0);
  }
}

function addConcreteMinutes(
  eco: EcoZoneMinutes,
  sample: ConcreteSample,
  thresholds: PlannedEcoThresholds,
  minutes: number
): boolean {
  const threshold = thresholdForSignal(sample.signal, thresholds);
  if (threshold == null) return false;
  const zone = assignEcoZone(
    sample.value,
    threshold,
    ecoBoundariesForSignal(sample.signal),
    sample.signal
  );
  eco[zone] = (eco[zone] ?? 0) + minutes;
  return true;
}

function scoreLeaf(
  step: LeafStep,
  thresholds: PlannedEcoThresholds,
  eco: EcoZoneMinutes
): number {
  if (isRestIntensity(step.intensity)) return 0;
  const minutes = leafDurationMinutes(step);
  if (!(minutes > 0)) return 0;

  const concrete = resolveConcreteSample(step.target, {
    targetPaceSeconds: step.targetPaceSeconds,
  });
  if (concrete && addConcreteMinutes(eco, concrete, thresholds, minutes)) {
    return minutes;
  }

  addTizMinutesToEco(eco, targetZoneFromTarget(step.target), minutes);
  return minutes;
}

function scoreRamp(
  step: RampStep,
  thresholds: PlannedEcoThresholds,
  eco: EcoZoneMinutes
): number {
  const minutes = step.duration.value > 0 ? step.duration.value / 60 : 0;
  if (!(minutes > 0)) return 0;

  const { signal, low, high, mode, lowZone, highZone } = step.target;
  const lookingZone =
    mode === "zone" ||
    (lowZone != null && highZone != null) ||
    isZoneLookingRange(low, high);

  if (!lookingZone && (signal === "power" || signal === "pace" || signal === "speed" || signal === "heart_rate")) {
    const mid = (low + high) / 2;
    const concrete: ConcreteSample | null =
      signal === "power"
        ? { signal: "POWER", value: mid }
        : signal === "heart_rate"
          ? { signal: "HEART_RATE", value: mid }
          : { signal: "PACE", value: mid };
    if (addConcreteMinutes(eco, concrete, thresholds, minutes)) {
      return minutes;
    }
  }

  const tiz =
    lowZone != null && highZone != null
      ? Math.round((lowZone + highZone) / 2)
      : Math.round((low + high) / 2);
  addTizMinutesToEco(eco, tiz, minutes);
  return minutes;
}

function walkNodes(
  nodes: WorkoutNode[],
  thresholds: PlannedEcoThresholds,
  eco: EcoZoneMinutes,
  thresholdPaceSeconds?: number | null
): number {
  let scoredMinutes = 0;

  for (const node of nodes) {
    if (node.kind === "step") {
      scoredMinutes += scoreLeaf(node, thresholds, eco);
      continue;
    }
    if (node.kind === "ramp") {
      scoredMinutes += scoreRamp(node, thresholds, eco);
      continue;
    }
    if (node.kind === "swim_interval") {
      const flat = swimIntervalToFlatSteps(node, thresholdPaceSeconds);
      for (const step of flat) {
        if (step.type === "rest") continue;
        const minutes =
          step.durationMinutes > 0
            ? step.durationMinutes
            : step.durationSeconds > 0
              ? step.durationSeconds / 60
              : 0;
        if (!(minutes > 0)) continue;
        if (
          step.targetPaceSeconds != null &&
          step.targetPaceSeconds > 0 &&
          addConcreteMinutes(
            eco,
            { signal: "PACE", value: step.targetPaceSeconds },
            thresholds,
            minutes
          )
        ) {
          scoredMinutes += minutes;
          continue;
        }
        addTizMinutesToEco(eco, step.targetZone, minutes);
        scoredMinutes += minutes;
      }
      continue;
    }
    if (node.kind === "repeat") {
      for (let i = 0; i < node.repeatCount; i++) {
        scoredMinutes += walkNodes(
          node.children,
          thresholds,
          eco,
          thresholdPaceSeconds
        );
      }
    }
  }

  return scoredMinutes;
}

/**
 * Map a structured workout tree into ECO zone minutes.
 * Concrete watts/pace/HR use assignEcoZone; zone-only steps use TIZ_TO_ECO_SPLIT.
 * Returns null when the tree has no scored work minutes.
 */
export function ecoMinutesFromStructuredWorkout(input: {
  structuredSteps: unknown;
  thresholds: PlannedEcoThresholds;
}): { ecoZoneMinutes: EcoZoneMinutes; scoredMinutes: number } | null {
  const tree = parseWorkoutTree(input.structuredSteps);
  if (tree.nodes.length === 0) return null;

  const eco = emptyEcoZoneMinutes();
  const scoredMinutes = walkNodes(
    tree.nodes,
    input.thresholds,
    eco,
    input.thresholds.thresholdPaceSeconds
  );
  if (!(scoredMinutes > 0)) return null;
  return { ecoZoneMinutes: eco, scoredMinutes };
}

export function totalEcoZoneMinutes(eco: EcoZoneMinutes): number {
  let sum = 0;
  for (let z = 1; z <= 8; z++) sum += eco[z] ?? 0;
  return sum;
}

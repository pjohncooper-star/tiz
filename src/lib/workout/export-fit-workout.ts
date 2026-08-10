import { Encoder, Profile } from "@garmin/fitsdk";
import type { Discipline } from "@prisma/client";
import {
  encodeFitHeartRatePercent,
  encodeFitHeartRateValue,
  encodeFitPowerPercent,
  encodeFitPowerValue,
  encodeFitSpeedMps,
  paceSecondsToMps,
  percentPaceToMps,
  zoneToPercentFtp,
  zoneToPercentMaxHr,
  zoneToSpeedEncoded,
  type FitExportThresholds,
} from "@/lib/workout/fit-target-codec";
import {
  parseWorkoutTree,
  type LeafStep,
  type RampStep,
  type RepeatBlock,
  type StepTarget,
  type WorkoutNode,
} from "@/lib/workout/workout-tree";
import { walkFitStepManifest } from "@/lib/workout/fit-step-manifest";

type FitStepMessage = Record<string, unknown>;

function sportForDiscipline(discipline: Discipline): string {
  if (discipline === "RUN") return "running";
  if (discipline === "SWIM") return "swimming";
  return "cycling";
}

function intensityForLeaf(step: LeafStep): string {
  if (step.intensity === "warmup") return "warmup";
  if (step.intensity === "cooldown") return "cooldown";
  if (step.intensity === "rest" || step.intensity === "recovery") return "rest";
  if (step.intensity === "interval") return "interval";
  return "active";
}

function applyCustomRange(
  msg: FitStepMessage,
  targetType: string,
  lowField: string,
  highField: string,
  low: number,
  high: number
): void {
  msg.targetType = targetType;
  msg.targetValue = 0;
  msg[lowField] = low;
  msg[highField] = high;
}

function encodeZoneRangeAsPower(
  lowZone: number,
  highZone: number
): { low: number; high: number } {
  return {
    low: encodeFitPowerPercent(zoneToPercentFtp(lowZone)),
    high: encodeFitPowerPercent(zoneToPercentFtp(highZone)),
  };
}

function encodeZoneRangeAsHeartRate(
  lowZone: number,
  highZone: number
): { low: number; high: number } {
  return {
    low: encodeFitHeartRatePercent(zoneToPercentMaxHr(lowZone)),
    high: encodeFitHeartRatePercent(zoneToPercentMaxHr(highZone)),
  };
}

function applyLeafTarget(
  msg: FitStepMessage,
  target: StepTarget,
  step: LeafStep,
  discipline: Discipline,
  thresholds: FitExportThresholds
): void {
  if (target.signal === "open") {
    msg.targetType = "open";
    return;
  }

  if (target.mode === "zone" && target.zone) {
    if (target.signal === "heart_rate") {
      msg.targetType = "heartRate";
      msg.targetHrZone = target.zone;
      return;
    }
    if (target.signal === "power") {
      msg.targetType = "power";
      msg.targetPowerZone = target.zone;
      return;
    }
    if (target.signal === "pace" || target.signal === "speed") {
      const encoded = zoneToSpeedEncoded(target.zone, discipline, thresholds);
      applyCustomRange(msg, "speed", "customTargetSpeedLow", "customTargetSpeedHigh", encoded, encoded);
      return;
    }
  }

  // Percent values are relative, so small integers are never zone indices.
  const percent = target.unit === "percent";

  if (target.mode === "range" && target.low != null && target.high != null) {
    if (target.signal === "heart_rate") {
      const lowZone = Math.round(target.low);
      const highZone = Math.round(target.high);
      if (!percent && lowZone >= 1 && lowZone <= 5 && highZone >= 1 && highZone <= 5) {
        const { low, high } = encodeZoneRangeAsHeartRate(lowZone, highZone);
        applyCustomRange(msg, "heartRate", "customTargetHeartRateLow", "customTargetHeartRateHigh", low, high);
      } else {
        applyCustomRange(
          msg,
          "heartRate",
          "customTargetHeartRateLow",
          "customTargetHeartRateHigh",
          encodeFitHeartRateValue(target.low, target.unit, thresholds),
          encodeFitHeartRateValue(target.high, target.unit, thresholds)
        );
      }
      return;
    }

    if (target.signal === "pace" || target.signal === "speed") {
      const lowZone = Math.round(target.low);
      const highZone = Math.round(target.high);
      if (
        !percent &&
        lowZone >= 1 &&
        lowZone <= 7 &&
        highZone >= 1 &&
        highZone <= 7 &&
        lowZone === target.low &&
        highZone === target.high
      ) {
        const lowEnc = zoneToSpeedEncoded(lowZone, discipline, thresholds);
        const highEnc = zoneToSpeedEncoded(highZone, discipline, thresholds);
        applyCustomRange(msg, "speed", "customTargetSpeedLow", "customTargetSpeedHigh", lowEnc, highEnc);
      } else {
        // Percent is % of threshold speed (higher = faster); pace seconds invert.
        const lowMps = percent
          ? percentPaceToMps(Math.min(target.low, target.high), discipline, thresholds)
          : paceSecondsToMps(target.high, discipline);
        const highMps = percent
          ? percentPaceToMps(Math.max(target.low, target.high), discipline, thresholds)
          : paceSecondsToMps(target.low, discipline);
        applyCustomRange(
          msg,
          "speed",
          "customTargetSpeedLow",
          "customTargetSpeedHigh",
          encodeFitSpeedMps(lowMps),
          encodeFitSpeedMps(highMps)
        );
      }
      return;
    }

    const lowZone = Math.round(target.low);
    const highZone = Math.round(target.high);
    if (
      target.signal === "power" &&
      !percent &&
      lowZone >= 1 &&
      lowZone <= 7 &&
      highZone >= 1 &&
      highZone <= 7 &&
      lowZone === target.low &&
      highZone === target.high
    ) {
      const { low, high } = encodeZoneRangeAsPower(lowZone, highZone);
      applyCustomRange(msg, "power", "customTargetPowerLow", "customTargetPowerHigh", low, high);
      return;
    }

    applyCustomRange(
      msg,
      "power",
      "customTargetPowerLow",
      "customTargetPowerHigh",
      encodeFitPowerValue(target.low, target.unit, thresholds),
      encodeFitPowerValue(target.high, target.unit, thresholds)
    );
    return;
  }

  if (target.mode === "value") {
    if (target.signal === "heart_rate" && target.value != null) {
      const encoded = encodeFitHeartRateValue(target.value, target.unit, thresholds);
      applyCustomRange(
        msg,
        "heartRate",
        "customTargetHeartRateLow",
        "customTargetHeartRateHigh",
        encoded,
        encoded
      );
      return;
    }

    if (target.signal === "pace" || target.signal === "speed") {
      const mps =
        percent && target.value != null
          ? percentPaceToMps(target.value, discipline, thresholds)
          : step.targetPaceSeconds
            ? paceSecondsToMps(step.targetPaceSeconds, discipline)
            : null;
      if (mps != null) {
        const encoded = encodeFitSpeedMps(mps);
        applyCustomRange(msg, "speed", "customTargetSpeedLow", "customTargetSpeedHigh", encoded, encoded);
        return;
      }
    }

    if (target.signal === "power" && target.value != null) {
      const encoded = encodeFitPowerValue(target.value, target.unit, thresholds);
      applyCustomRange(msg, "power", "customTargetPowerLow", "customTargetPowerHigh", encoded, encoded);
    }
  }
}

function emitLeaf(
  step: LeafStep,
  messageIndex: number,
  discipline: Discipline,
  thresholds: FitExportThresholds
): FitStepMessage {
  const msg: FitStepMessage = {
    messageIndex,
    intensity: intensityForLeaf(step),
  };

  if (step.duration.type === "open") {
    msg.durationType = "open";
  } else if (step.duration.type === "distance") {
    msg.durationType = "distance";
    msg.durationValue = Math.round(step.duration.value);
    msg.durationDistance = step.duration.value;
  } else {
    msg.durationType = "time";
    msg.durationValue = Math.round(step.duration.value);
    msg.durationTime = step.duration.value;
  }

  applyLeafTarget(msg, step.target, step, discipline, thresholds);

  if (step.notes) msg.notes = step.notes;
  return msg;
}

function emitRamp(
  step: RampStep,
  messageIndex: number,
  discipline: Discipline,
  thresholds: FitExportThresholds
): FitStepMessage {
  const msg: FitStepMessage = {
    messageIndex,
    durationType: "time",
    durationValue: Math.round(step.duration.value),
    durationTime: step.duration.value,
    intensity: "active",
  };

  const lowZone = step.target.lowZone ?? null;
  const highZone = step.target.highZone ?? null;

  if (lowZone != null && highZone != null) {
    if (step.target.signal === "heart_rate") {
      const { low, high } = encodeZoneRangeAsHeartRate(lowZone, highZone);
      applyCustomRange(msg, "heartRate", "customTargetHeartRateLow", "customTargetHeartRateHigh", low, high);
    } else if (step.target.signal === "pace" || step.target.signal === "speed") {
      const lowEnc = zoneToSpeedEncoded(lowZone, discipline, thresholds);
      const highEnc = zoneToSpeedEncoded(highZone, discipline, thresholds);
      applyCustomRange(msg, "speed", "customTargetSpeedLow", "customTargetSpeedHigh", lowEnc, highEnc);
    } else {
      const { low, high } = encodeZoneRangeAsPower(lowZone, highZone);
      applyCustomRange(msg, "power", "customTargetPowerLow", "customTargetPowerHigh", low, high);
    }
    return msg;
  }

  const rampPercent = step.target.unit === "percent";

  if (step.target.signal === "heart_rate") {
    applyCustomRange(
      msg,
      "heartRate",
      "customTargetHeartRateLow",
      "customTargetHeartRateHigh",
      encodeFitHeartRateValue(step.target.low, step.target.unit, thresholds),
      encodeFitHeartRateValue(step.target.high, step.target.unit, thresholds)
    );
    return msg;
  }

  if (step.target.signal === "pace" || step.target.signal === "speed") {
    const lowMps = rampPercent
      ? percentPaceToMps(Math.min(step.target.low, step.target.high), discipline, thresholds)
      : paceSecondsToMps(step.target.high, discipline);
    const highMps = rampPercent
      ? percentPaceToMps(Math.max(step.target.low, step.target.high), discipline, thresholds)
      : paceSecondsToMps(step.target.low, discipline);
    applyCustomRange(
      msg,
      "speed",
      "customTargetSpeedLow",
      "customTargetSpeedHigh",
      encodeFitSpeedMps(lowMps),
      encodeFitSpeedMps(highMps)
    );
    return msg;
  }

  applyCustomRange(
    msg,
    "power",
    "customTargetPowerLow",
    "customTargetPowerHigh",
    encodeFitPowerValue(step.target.low, step.target.unit, thresholds),
    encodeFitPowerValue(step.target.high, step.target.unit, thresholds)
  );
  return msg;
}

function flattenNodes(
  nodes: WorkoutNode[],
  out: FitStepMessage[],
  _startIndex: number,
  discipline: Discipline,
  thresholds: FitExportThresholds
): number {
  walkFitStepManifest(nodes, {
    onRepeat: (node, messageIndex) => {
      const childStart = messageIndex + 1;
      out.push({
        messageIndex,
        durationType: "repeatUntilStepsCmplt",
        durationValue: node.repeatCount,
        durationStep: childStart,
      });
    },
    onRamp: (node, messageIndex) => {
      out.push(emitRamp(node, messageIndex, discipline, thresholds));
    },
    onLeaf: (node, messageIndex) => {
      out.push(emitLeaf(node, messageIndex, discipline, thresholds));
    },
  });
  return out.length;
}

export function workoutTreeToFit(
  title: string,
  discipline: Discipline,
  raw: unknown,
  thresholds: FitExportThresholds = {}
): Uint8Array {
  const tree = parseWorkoutTree(raw);
  const encoder = new Encoder();

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: "workout",
    manufacturer: "development",
    product: 0,
    timeCreated: new Date(),
  } as FitStepMessage & { mesgNum: number });

  const steps: FitStepMessage[] = [];
  flattenNodes(tree.nodes, steps, 0, discipline, thresholds);

  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    wktName: title.slice(0, 80),
    sport: sportForDiscipline(discipline),
    numValidSteps: steps.length,
  } as FitStepMessage & { mesgNum: number });

  for (const step of steps) {
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.WORKOUT_STEP,
      ...step,
    } as FitStepMessage & { mesgNum: number });
  }

  return encoder.close();
}

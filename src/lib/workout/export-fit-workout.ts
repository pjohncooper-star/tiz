import { Encoder, Profile } from "@garmin/fitsdk";
import type { Discipline } from "@prisma/client";
import {
  encodeFitHeartRate,
  encodeFitHeartRatePercent,
  encodeFitPower,
  encodeFitPowerPercent,
  encodeFitSpeedMps,
  paceSecondsToMps,
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

  if (target.mode === "range" && target.low != null && target.high != null) {
    if (target.signal === "heart_rate") {
      const lowZone = Math.round(target.low);
      const highZone = Math.round(target.high);
      if (lowZone >= 1 && lowZone <= 5 && highZone >= 1 && highZone <= 5) {
        const { low, high } = encodeZoneRangeAsHeartRate(lowZone, highZone);
        applyCustomRange(msg, "heartRate", "customTargetHeartRateLow", "customTargetHeartRateHigh", low, high);
      } else {
        applyCustomRange(
          msg,
          "heartRate",
          "customTargetHeartRateLow",
          "customTargetHeartRateHigh",
          encodeFitHeartRate(target.low, thresholds),
          encodeFitHeartRate(target.high, thresholds)
        );
      }
      return;
    }

    if (target.signal === "pace" || target.signal === "speed") {
      const lowZone = Math.round(target.low);
      const highZone = Math.round(target.high);
      if (
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
        const lowMps = paceSecondsToMps(target.high, discipline);
        const highMps = paceSecondsToMps(target.low, discipline);
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
      encodeFitPower(target.low, thresholds),
      encodeFitPower(target.high, thresholds)
    );
    return;
  }

  if (target.mode === "value") {
    if (target.signal === "heart_rate" && target.value != null) {
      const encoded = encodeFitHeartRate(target.value, thresholds);
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

    if ((target.signal === "pace" || target.signal === "speed") && step.targetPaceSeconds) {
      const mps = paceSecondsToMps(step.targetPaceSeconds, discipline);
      const encoded = encodeFitSpeedMps(mps);
      applyCustomRange(msg, "speed", "customTargetSpeedLow", "customTargetSpeedHigh", encoded, encoded);
      return;
    }

    if (target.signal === "power" && target.value != null) {
      const encoded = encodeFitPower(target.value, thresholds);
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

  if (step.target.signal === "heart_rate") {
    applyCustomRange(
      msg,
      "heartRate",
      "customTargetHeartRateLow",
      "customTargetHeartRateHigh",
      encodeFitHeartRate(step.target.low, thresholds),
      encodeFitHeartRate(step.target.high, thresholds)
    );
    return msg;
  }

  if (step.target.signal === "pace" || step.target.signal === "speed") {
    const lowMps = paceSecondsToMps(step.target.high, discipline);
    const highMps = paceSecondsToMps(step.target.low, discipline);
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
    encodeFitPower(step.target.low, thresholds),
    encodeFitPower(step.target.high, thresholds)
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

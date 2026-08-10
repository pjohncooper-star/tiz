import { swimIntervalToRepeatBlock } from "@/lib/workout/swim-interval-set";
import {
  parseWorkoutTree,
  type LeafStep,
  type RampStep,
  type RepeatBlock,
  type StepTarget,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

function zoneToZwoFraction(zone: number): number {
  if (zone <= 1) return 0.5;
  if (zone === 2) return 0.65;
  if (zone === 3) return 0.75;
  if (zone === 4) return 0.9;
  if (zone === 5) return 1.05;
  if (zone === 6) return 1.2;
  return 1.35;
}

/** ZWO power is a fraction of FTP, so percent targets map straight across. */
function targetPowerFraction(target: StepTarget, fallback: number): number {
  if (target.mode === "zone" && target.zone) {
    return zoneToZwoFraction(target.zone);
  }
  if (target.unit === "percent" && target.signal === "power") {
    const percent =
      target.mode === "value"
        ? target.value
        : target.low != null && target.high != null
          ? (target.low + target.high) / 2
          : null;
    if (percent != null && percent > 0) return percent / 100;
  }
  return fallback;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emitLeaf(step: LeafStep, lines: string[]): void {
  const durationSec = step.duration.type === "time" ? step.duration.value : 600;
  const tag =
    step.intensity === "warmup"
      ? "Warmup"
      : step.intensity === "cooldown"
        ? "Cooldown"
        : step.intensity === "rest" || step.intensity === "recovery"
          ? "Rest"
          : step.target.signal === "open"
            ? "FreeRide"
            : "SteadyState";
  const power = targetPowerFraction(step.target, 0.65);
  if (tag === "FreeRide") {
    lines.push(`    <FreeRide Duration="${durationSec}" />`);
    return;
  }
  if (tag === "Rest") {
    lines.push(`    <Rest Duration="${durationSec}" Power="${power.toFixed(2)}" />`);
    return;
  }
  lines.push(`    <${tag} Duration="${durationSec}" Power="${power.toFixed(2)}" />`);
}

function rampEdgeFraction(value: number, zone: number | undefined, percent: boolean): number {
  if (zone != null) return zoneToZwoFraction(zone);
  if (percent) return value / 100;
  return value <= 1 ? value : value / 100;
}

function emitRamp(step: RampStep, lines: string[]): void {
  const percent = step.target.unit === "percent";
  const low = rampEdgeFraction(step.target.low, step.target.lowZone, percent);
  const high = rampEdgeFraction(step.target.high, step.target.highZone, percent);
  const tag = step.target.lowZone != null && step.target.lowZone < (step.target.highZone ?? 0)
    ? "Warmup"
    : "Ramp";
  lines.push(
    `    <${tag} Duration="${step.duration.value}" PowerLow="${low.toFixed(2)}" PowerHigh="${high.toFixed(2)}" />`
  );
}

function emitRepeat(block: RepeatBlock, lines: string[]): void {
  if (block.children.length === 2) {
    const on = block.children[0];
    const off = block.children[1];
    if (on.kind === "step" && off.kind === "step") {
      const onDur = on.duration.type === "time" ? on.duration.value : 0;
      const offDur = off.duration.type === "time" ? off.duration.value : 0;
      const onPower = targetPowerFraction(on.target, 0.9);
      const offPower = targetPowerFraction(off.target, 0.55);
      lines.push(
        `    <IntervalsT Repeat="${block.repeatCount}" OnDuration="${onDur}" OffDuration="${offDur}" OnPower="${onPower.toFixed(2)}" OffPower="${offPower.toFixed(2)}" />`
      );
      return;
    }
  }
  for (let i = 0; i < block.repeatCount; i++) {
    for (const child of block.children) emitNode(child, lines);
  }
}

function emitNode(node: WorkoutNode, lines: string[]): void {
  if (node.kind === "step") emitLeaf(node, lines);
  else if (node.kind === "ramp") emitRamp(node, lines);
  else if (node.kind === "repeat") emitRepeat(node, lines);
  else if (node.kind === "swim_interval") emitRepeat(swimIntervalToRepeatBlock(node), lines);
}

export function workoutTreeToZwo(title: string, raw: unknown): string {
  const tree: WorkoutTreeDocument = parseWorkoutTree(raw);
  const lines = [
    `<workout_file>`,
    `  <author>TiZ</author>`,
    `  <name>${escapeXml(title)}</name>`,
    `  <sportType>bike</sportType>`,
    `  <description>Exported from TiZ</description>`,
    `  <workout>`,
  ];
  for (const node of tree.nodes) emitNode(node, lines);
  lines.push(`  </workout>`, `</workout_file>`);
  return lines.join("\n");
}

/** @deprecated Use workoutTreeToZwo */
export function workoutStepsToZwo(title: string, raw: unknown): string {
  return workoutTreeToZwo(title, raw);
}

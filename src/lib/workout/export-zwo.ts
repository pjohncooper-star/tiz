import { swimIntervalToRepeatBlock } from "@/lib/workout/swim-interval-set";
import {
  parseWorkoutTree,
  type LeafStep,
  type RampStep,
  type RepeatBlock,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";
import { clampZone, type ZoneNumber } from "@/lib/zones/model";

/** Zwift target power per zone, as a fraction of FTP. Mirrors the FIT export ladder. */
const ZWO_FRACTION_BY_ZONE: Record<ZoneNumber, number> = {
  1: 0.5,
  2: 0.65,
  3: 0.75,
  4: 0.9,
  5: 1.05,
};

function zoneToZwoFraction(zone: number): number {
  return ZWO_FRACTION_BY_ZONE[clampZone(zone)];
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
  const power =
    step.target.mode === "zone" && step.target.zone
      ? zoneToZwoFraction(step.target.zone)
      : 0.65;
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

function emitRamp(step: RampStep, lines: string[]): void {
  const low =
    step.target.lowZone != null
      ? zoneToZwoFraction(step.target.lowZone)
      : step.target.low <= 1
        ? step.target.low
        : step.target.low / 100;
  const high =
    step.target.highZone != null
      ? zoneToZwoFraction(step.target.highZone)
      : step.target.high <= 1
        ? step.target.high
        : step.target.high / 100;
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
      const onPower =
        on.target.mode === "zone" && on.target.zone
          ? zoneToZwoFraction(on.target.zone)
          : 0.9;
      const offPower =
        off.target.mode === "zone" && off.target.zone
          ? zoneToZwoFraction(off.target.zone)
          : 0.55;
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

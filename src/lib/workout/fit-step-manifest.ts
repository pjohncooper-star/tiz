import type { Discipline } from "@prisma/client";
import {
  intensityLabel,
  type LeafStep,
  type RampStep,
  type RepeatBlock,
  type StepIntensity,
  type WorkoutNode,
} from "@/lib/workout/workout-tree";
import { swimIntervalToRepeatBlock } from "@/lib/workout/swim-interval-set";

export type FitStepManifestEntry = {
  messageIndex: number;
  kind: "leaf" | "ramp" | "repeat";
  label: string;
  plannedSeconds: number;
  openDuration: boolean;
  repeatCount?: number;
  intensity?: StepIntensity;
};

export type FitManifestWalker = {
  onRepeat: (node: RepeatBlock, messageIndex: number) => void;
  onLeaf: (node: LeafStep, messageIndex: number) => void;
  onRamp: (node: RampStep, messageIndex: number) => void;
};

function leafPlannedSeconds(node: LeafStep): number {
  if (node.duration.type === "time") return node.duration.value;
  if (node.duration.type === "open") return node.duration.estimateSeconds ?? 0;
  return 0;
}

export function executionLabelForLeaf(node: LeafStep, discipline: Discipline): string {
  if (node.intensity === "warmup") return "Warm up";
  if (node.intensity === "cooldown") return "Cool down";
  if (node.intensity === "rest" || node.intensity === "recovery") return "Rest";
  if (discipline === "BIKE") return "Bike";
  if (discipline === "RUN") return "Run";
  if (discipline === "SWIM") return "Swim";
  return intensityLabel(node.intensity);
}

/** Walk workout nodes assigning FIT message_index in export order. */
export function walkFitStepManifest(nodes: WorkoutNode[], walker: FitManifestWalker): void {
  let idx = 0;

  function walk(nodeList: WorkoutNode[]): void {
    for (const node of nodeList) {
      if (node.kind === "swim_interval") {
        const block = swimIntervalToRepeatBlock(node);
        walker.onRepeat(block, idx);
        idx++;
        walk(block.children);
        continue;
      }
      if (node.kind === "repeat") {
        walker.onRepeat(node, idx);
        idx++;
        walk(node.children);
        continue;
      }
      if (node.kind === "ramp") {
        walker.onRamp(node, idx);
        idx++;
        continue;
      }
      walker.onLeaf(node, idx);
      idx++;
    }
  }

  walk(nodes);
}

export function buildFitStepManifest(
  nodes: WorkoutNode[],
  discipline: Discipline
): FitStepManifestEntry[] {
  const entries: FitStepManifestEntry[] = [];

  walkFitStepManifest(nodes, {
    onRepeat: (node, messageIndex) => {
      entries.push({
        messageIndex,
        kind: "repeat",
        label: `Repeat ×${node.repeatCount}`,
        plannedSeconds: 0,
        openDuration: false,
        repeatCount: node.repeatCount,
      });
    },
    onRamp: (node, messageIndex) => {
      entries.push({
        messageIndex,
        kind: "ramp",
        label: "Ramp",
        plannedSeconds: node.duration.value,
        openDuration: false,
      });
    },
    onLeaf: (node, messageIndex) => {
      entries.push({
        messageIndex,
        kind: "leaf",
        label: executionLabelForLeaf(node, discipline),
        plannedSeconds: leafPlannedSeconds(node),
        openDuration: node.duration.type === "open",
        intensity: node.intensity,
      });
    },
  });

  return entries;
}

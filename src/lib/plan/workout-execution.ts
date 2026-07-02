import type { Discipline } from "@prisma/client";
import {
  executionLabelForLeaf,
  walkFitStepManifest,
} from "@/lib/workout/fit-step-manifest";
import { swimIntervalToRepeatBlock } from "@/lib/workout/swim-interval-set";
import {
  parseWorkoutTree,
  type WorkoutNode,
} from "@/lib/workout/workout-tree";
import type { WorkoutExecutionLap } from "@/lib/zones/compute";

export type PlannedExecutionStep = {
  index: number;
  label: string;
  plannedSeconds: number;
  openDuration: boolean;
};

export type StepExecutionRow = {
  index: number;
  label: string;
  plannedSeconds: number | null;
  actualSeconds: number | null;
  deltaSeconds: number | null;
  openDuration: boolean;
  groupLabel?: string;
};

type ExpandedExecutionRow = {
  rowIndex: number;
  messageIndex: number;
  groupLabel: string | null;
  label: string;
  plannedSeconds: number;
  openDuration: boolean;
};

export type { ExpandedExecutionRow };

export function expandExecutionOccurrences(
  nodes: WorkoutNode[],
  discipline: Discipline
): ExpandedExecutionRow[] {
  const rows: ExpandedExecutionRow[] = [];
  const useGroups = hasRepeatInTree(nodes);
  let rowIndex = 0;
  const messageIndexRef = { value: 0 };

  function walk(nodeList: WorkoutNode[], groupLabel: string | null): void {
    for (const node of nodeList) {
      const repeatNode = asRepeatNode(node);
      if (repeatNode) {
        messageIndexRef.value++;
        const templates = collectTemplateRows(repeatNode.children, discipline, messageIndexRef);
        for (let r = 0; r < repeatNode.repeatCount; r++) {
          const roundLabel = useGroups ? `Interval ${r + 1}` : null;
          for (const template of templates) {
            rows.push({
              ...template,
              rowIndex: rowIndex++,
              groupLabel: roundLabel,
            });
          }
        }
        continue;
      }
      if (node.kind === "ramp") {
        rows.push({
          rowIndex: rowIndex++,
          messageIndex: messageIndexRef.value,
          groupLabel,
          label: "Ramp",
          plannedSeconds: node.duration.value,
          openDuration: false,
        });
        messageIndexRef.value++;
        continue;
      }
      if (node.kind === "step") {
        rows.push({
          rowIndex: rowIndex++,
          messageIndex: messageIndexRef.value,
          groupLabel,
          label: executionLabelForLeaf(node, discipline),
          plannedSeconds: leafPlannedSeconds(node),
          openDuration: node.duration.type === "open",
        });
        messageIndexRef.value++;
      }
    }
  }

  walk(nodes, null);
  return rows;
}

function hasRepeatInTree(nodes: WorkoutNode[]): boolean {
  for (const node of nodes) {
    if (node.kind === "repeat" || node.kind === "swim_interval") return true;
  }
  return false;
}

function asRepeatNode(node: WorkoutNode) {
  if (node.kind === "repeat") return node;
  if (node.kind === "swim_interval") return swimIntervalToRepeatBlock(node);
  return null;
}

function normalizeWorkoutLaps(laps: WorkoutExecutionLap[]): WorkoutExecutionLap[] {
  return laps
    .map((lap) => {
      const elapsedSeconds = Number(lap.elapsedSeconds);
      const wktStepIndex =
        lap.wktStepIndex != null ? Number(lap.wktStepIndex) : undefined;
      return {
        ...lap,
        elapsedSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
        ...(Number.isInteger(wktStepIndex) ? { wktStepIndex } : {}),
      };
    })
    .filter((lap) => lap.elapsedSeconds > 0);
}

function leafPlannedSeconds(node: Extract<WorkoutNode, { kind: "step" }>): number {
  if (node.duration.type === "time") return node.duration.value;
  if (node.duration.type === "open") return node.duration.estimateSeconds ?? 0;
  return 0;
}

function collectTemplateRows(
  nodeList: WorkoutNode[],
  discipline: Discipline,
  messageIndexRef: { value: number }
): Array<Omit<ExpandedExecutionRow, "rowIndex" | "groupLabel">> {
  const templates: Array<Omit<ExpandedExecutionRow, "rowIndex" | "groupLabel">> = [];

  function walk(nodes: WorkoutNode[]): void {
    for (const node of nodes) {
      const repeatNode = asRepeatNode(node);
      if (repeatNode) {
        messageIndexRef.value++;
        const inner = collectTemplateRows(repeatNode.children, discipline, messageIndexRef);
        for (let r = 0; r < repeatNode.repeatCount; r++) {
          templates.push(...inner);
        }
        continue;
      }
      if (node.kind === "ramp") {
        templates.push({
          messageIndex: messageIndexRef.value,
          label: "Ramp",
          plannedSeconds: node.duration.value,
          openDuration: false,
        });
        messageIndexRef.value++;
        continue;
      }
      if (node.kind === "step") {
        templates.push({
          messageIndex: messageIndexRef.value,
          label: executionLabelForLeaf(node, discipline),
          plannedSeconds: leafPlannedSeconds(node),
          openDuration: node.duration.type === "open",
        });
        messageIndexRef.value++;
      }
    }
  }

  walk(nodeList);
  return templates;
}

/** Merge consecutive laps with the same wktStepIndex (e.g. one rest split across two laps). */
function groupConsecutiveWktLaps(laps: WorkoutExecutionLap[]): number[] {
  const groups: number[] = [];
  let i = 0;
  while (i < laps.length) {
    const wkt = laps[i].wktStepIndex;
    let sum = 0;
    while (i < laps.length && laps[i].wktStepIndex === wkt) {
      sum += laps[i].elapsedSeconds;
      i++;
    }
    groups.push(sum);
  }
  return groups;
}

function pairLapsToExpandedRows(
  expanded: ExpandedExecutionRow[],
  laps: WorkoutExecutionLap[]
): StepExecutionRow[] {
  const wktLaps = normalizeWorkoutLaps(laps).filter((l) => l.wktStepIndex != null);
  const lapGroups = groupConsecutiveWktLaps(wktLaps);

  return expanded.map((row, i) => {
    const actual = lapGroups[i] ?? null;

    return {
      index: row.rowIndex,
      groupLabel: row.groupLabel ?? undefined,
      label: row.label,
      plannedSeconds: row.plannedSeconds > 0 ? row.plannedSeconds : null,
      actualSeconds: actual,
      deltaSeconds:
        actual != null && row.plannedSeconds > 0
          ? actual - row.plannedSeconds
          : null,
      openDuration: row.openDuration,
    };
  });
}

function pairManualLapsToExpandedRows(
  expanded: ExpandedExecutionRow[],
  laps: WorkoutExecutionLap[]
): StepExecutionRow[] {
  const manualLaps = normalizeWorkoutLaps(laps).filter((l) => l.lapTrigger === "manual");

  return expanded.map((row, i) => {
    const lap = manualLaps[i];
    const actual = lap?.elapsedSeconds ?? null;

    return {
      index: row.rowIndex,
      groupLabel: row.groupLabel ?? undefined,
      label: row.label,
      plannedSeconds: row.plannedSeconds > 0 ? row.plannedSeconds : null,
      actualSeconds: actual,
      deltaSeconds:
        actual != null && row.plannedSeconds > 0
          ? actual - row.plannedSeconds
          : null,
      openDuration: row.openDuration,
    };
  });
}

/** @deprecated Use buildStepExecutionRows; kept for callers that only need flat planned steps. */
export function flattenTreeForExecution(raw: unknown): PlannedExecutionStep[] {
  const tree = parseWorkoutTree(raw);
  const expanded = expandExecutionOccurrences(tree.nodes, "RUN");
  return expanded.map((row) => ({
    index: row.rowIndex,
    label: row.label,
    plannedSeconds: row.plannedSeconds,
    openDuration: row.openDuration,
  }));
}

export function buildStepExecutionRows(
  rawPlanned: unknown,
  workoutLaps: WorkoutExecutionLap[] | undefined,
  discipline: Discipline
): StepExecutionRow[] | null {
  if (!workoutLaps?.length) return null;

  const normalizedLaps = normalizeWorkoutLaps(workoutLaps);
  if (normalizedLaps.length === 0) return null;

  const tree = parseWorkoutTree(rawPlanned);
  const expanded = expandExecutionOccurrences(tree.nodes, discipline);
  if (expanded.length === 0) return null;

  const hasWktStepIndex = normalizedLaps.some((l) => l.wktStepIndex != null);

  if (!hasWktStepIndex) {
    const manualLaps = normalizedLaps.filter((l) => l.lapTrigger === "manual");
    if (manualLaps.length === 0) return null;
    return pairManualLapsToExpandedRows(expanded, normalizedLaps);
  }

  return pairLapsToExpandedRows(expanded, normalizedLaps);
}

/** Exposed for tests — FIT message_index assignment matches export flattenNodes. */
export function collectFitMessageIndices(nodes: WorkoutNode[]): number[] {
  const indices: number[] = [];
  walkFitStepManifest(nodes, {
    onRepeat: (_node, messageIndex) => indices.push(messageIndex),
    onLeaf: (_node, messageIndex) => indices.push(messageIndex),
    onRamp: (_node, messageIndex) => indices.push(messageIndex),
  });
  return indices;
}

export function formatDeltaSeconds(delta: number | null): string {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : "";
  const abs = Math.abs(delta);
  if (abs < 60) return `${sign}${abs}s`;
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}

import type { Discipline, SignalType } from "@prisma/client";
import type { TargetSignal, WorkoutNode } from "@/lib/workout/workout-tree";

function noteTargetSignal(
  signal: TargetSignal | undefined,
  flags: { sawPower: boolean; sawPace: boolean; sawHr: boolean }
): void {
  if (signal === "power") flags.sawPower = true;
  else if (signal === "pace" || signal === "speed") flags.sawPace = true;
  else if (signal === "heart_rate") flags.sawHr = true;
}

/**
 * Infer the TiZ / profile signal from how a structured workout is prescribed.
 * Presence-based (not duration majority): HR-only → HEART_RATE; any power on bike
 * (or power with no pace) → POWER; pace on run/swim → PACE.
 * Returns null when there are no informative targets (caller falls back to prefs).
 */
export function inferSignalFromWorkoutNodes(
  nodes: WorkoutNode[],
  discipline: Discipline
): SignalType | null {
  if (nodes.length === 0) return null;

  const flags = { sawPower: false, sawPace: false, sawHr: false };

  function walk(list: WorkoutNode[]): void {
    for (const node of list) {
      if (node.kind === "repeat") {
        walk(node.children);
        continue;
      }
      if (node.kind === "swim_interval") {
        noteTargetSignal(node.target.signal, flags);
        continue;
      }
      if (node.kind === "ramp") {
        noteTargetSignal(node.target.signal, flags);
        continue;
      }
      noteTargetSignal(node.target.signal, flags);
    }
  }
  walk(nodes);

  const { sawPower, sawPace, sawHr } = flags;
  if (!sawPower && !sawPace && !sawHr) return null;
  if (sawHr && !sawPower && !sawPace) return "HEART_RATE";
  if (sawPower && (discipline === "BIKE" || !sawPace)) return "POWER";
  if (sawPace && (discipline === "RUN" || discipline === "SWIM")) return "PACE";
  if (sawPower) return "POWER";
  if (sawHr) return "HEART_RATE";
  return null;
}

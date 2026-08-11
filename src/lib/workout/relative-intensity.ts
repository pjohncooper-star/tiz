/**
 * Helpers for relative intensity (pace race refs + power/HR % of threshold).
 * Collect missing anchors, freeze resolved absolutes on complete/link.
 */

import {
  formatRelativePaceLabel,
  resolveRelativePaceSeconds,
  type PaceRef,
  type PaceRefSource,
  type RelativePaceContext,
} from "@/lib/workout/relative-pace";
import type {
  LeafStep,
  StepTarget,
  WorkoutNode,
  WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";

export type RelativePaceRequirement = {
  ref: PaceRef;
  refSource: PaceRefSource;
  /** Human label for UI / errors. */
  label: string;
};

export type MissingRelativeIntensity = {
  pace: RelativePaceRequirement[];
  /** True when any relative power step needs FTP. */
  needsFtp: boolean;
  /** True when any relative HR step needs max HR. */
  needsMaxHr: boolean;
};

export type RelativeThresholdContext = RelativePaceContext & {
  ftpWatts?: number | null;
  maxHeartRateBpm?: number | null;
};

function walkLeaves(
  nodes: WorkoutNode[],
  visit: (step: LeafStep) => void
): void {
  for (const node of nodes) {
    if (node.kind === "step") {
      visit(node);
      continue;
    }
    if (node.kind === "repeat") {
      walkLeaves(node.children, visit);
      continue;
    }
    if (node.kind === "swim_interval") {
      // Swim interval targets are pace/zone on the set itself — treat via a synthetic leaf.
      const synthetic: LeafStep = {
        kind: "step",
        intensity: "interval",
        duration: { type: "distance", value: node.distanceMeters },
        target: node.target,
        ...(node.targetPaceSeconds != null
          ? { targetPaceSeconds: node.targetPaceSeconds }
          : {}),
      };
      visit(synthetic);
    }
  }
}

function mapLeaves(
  nodes: WorkoutNode[],
  map: (step: LeafStep) => LeafStep
): WorkoutNode[] {
  return nodes.map((node) => {
    if (node.kind === "step") return map(node);
    if (node.kind === "repeat") {
      return { ...node, children: mapLeaves(node.children, map) };
    }
    if (node.kind === "swim_interval") {
      const mapped = map({
        kind: "step",
        intensity: "interval",
        duration: { type: "distance", value: node.distanceMeters },
        target: node.target,
        ...(node.targetPaceSeconds != null
          ? { targetPaceSeconds: node.targetPaceSeconds }
          : {}),
      });
      return {
        ...node,
        target: mapped.target,
        ...(mapped.targetPaceSeconds != null
          ? { targetPaceSeconds: mapped.targetPaceSeconds }
          : { targetPaceSeconds: undefined }),
      };
    }
    return node;
  });
}

function requirementKey(req: RelativePaceRequirement): string {
  return `${req.refSource}:${req.ref}`;
}

/** Unique relative pace refs used in a workout tree. */
export function collectRelativePaceRequirements(
  nodes: WorkoutNode[]
): RelativePaceRequirement[] {
  const byKey = new Map<string, RelativePaceRequirement>();
  walkLeaves(nodes, (step) => {
    const t = step.target;
    if (t.mode !== "relative" || t.signal !== "pace" || !t.ref) return;
    const refSource: PaceRefSource = t.refSource ?? "fitness";
    const req: RelativePaceRequirement = {
      ref: t.ref,
      refSource,
      label: formatRelativePaceLabel({
        ref: t.ref,
        pct: t.pct,
        refSource,
      }),
    };
    byKey.set(requirementKey(req), req);
  });
  return [...byKey.values()];
}

export function isRelativePaceResolved(
  target: Pick<StepTarget, "ref" | "pct" | "refSource" | "mode" | "signal">,
  ctx: RelativePaceContext
): boolean {
  if (target.mode !== "relative" || target.signal !== "pace" || !target.ref) {
    return true;
  }
  return (
    resolveRelativePaceSeconds(
      { ref: target.ref, pct: target.pct, refSource: target.refSource },
      ctx
    ) != null
  );
}

export function missingRelativeIntensity(
  nodes: WorkoutNode[],
  ctx: RelativeThresholdContext
): MissingRelativeIntensity {
  const pace: RelativePaceRequirement[] = [];
  let needsFtp = false;
  let needsMaxHr = false;

  for (const req of collectRelativePaceRequirements(nodes)) {
    const resolved = resolveRelativePaceSeconds(
      { ref: req.ref, refSource: req.refSource },
      ctx
    );
    if (resolved == null) pace.push(req);
  }

  walkLeaves(nodes, (step) => {
    const t = step.target;
    if (t.mode !== "relative") return;
    if (t.signal === "power") {
      const ftp = ctx.ftpWatts;
      if (ftp == null || !(ftp > 0)) needsFtp = true;
    }
    if (t.signal === "heart_rate") {
      const maxHr = ctx.maxHeartRateBpm;
      if (maxHr == null || !(maxHr > 0)) needsMaxHr = true;
    }
  });

  return { pace, needsFtp, needsMaxHr };
}

export function formatMissingRelativeIntensity(
  missing: MissingRelativeIntensity
): string[] {
  const lines: string[] = [];
  for (const req of missing.pace) {
    if (req.ref === "threshold") {
      lines.push("Set your run/swim threshold pace (Settings → Thresholds)");
    } else if (req.refSource === "goal") {
      lines.push(`Set goal ${req.ref} pace (Settings → Race paces)`);
    } else {
      lines.push(`Set ${req.ref} pace (Settings → Race paces)`);
    }
  }
  if (missing.needsFtp) {
    lines.push("Set bike FTP (Settings → Thresholds)");
  }
  if (missing.needsMaxHr) {
    lines.push("Set max heart rate (Settings → Thresholds)");
  }
  // Dedupe while preserving order
  return [...new Set(lines)];
}

/** Resolve relative power (% FTP) or HR (% max) to absolute watts/bpm. */
export function resolveRelativePercentTarget(
  target: Pick<StepTarget, "signal" | "mode" | "pct" | "value">,
  ctx: Pick<RelativeThresholdContext, "ftpWatts" | "maxHeartRateBpm">
): number | null {
  if (target.mode !== "relative") return null;
  const pct = target.pct != null && target.pct > 0 ? target.pct : null;
  if (pct == null) return null;
  if (target.signal === "power") {
    const ftp = ctx.ftpWatts;
    if (ftp == null || !(ftp > 0)) return null;
    return Math.round((ftp * pct) / 100);
  }
  if (target.signal === "heart_rate") {
    const maxHr = ctx.maxHeartRateBpm;
    if (maxHr == null || !(maxHr > 0)) return null;
    return Math.round((maxHr * pct) / 100);
  }
  return null;
}

function freezeLeafTarget(
  step: LeafStep,
  ctx: RelativeThresholdContext
): LeafStep {
  const t = step.target;
  if (t.mode !== "relative") return step;

  if (t.signal === "pace" && t.ref) {
    const pace = resolveRelativePaceSeconds(
      { ref: t.ref, pct: t.pct, refSource: t.refSource },
      ctx
    );
    if (pace == null || !(pace > 0)) return step;
    return {
      ...step,
      target: { signal: "pace", mode: "value", value: pace },
      targetPaceSeconds: pace,
    };
  }

  if (t.signal === "power" || t.signal === "heart_rate") {
    const absolute = resolveRelativePercentTarget(t, ctx);
    if (absolute == null || !(absolute > 0)) return step;
    return {
      ...step,
      target: { signal: t.signal, mode: "value", value: absolute },
    };
  }

  return step;
}

/**
 * Bake relative targets to absolute values for historical stability.
 * Unresolvable relative steps are left unchanged.
 */
export function freezeRelativeTargetsInTree(
  tree: WorkoutTreeDocument,
  ctx: RelativeThresholdContext
): WorkoutTreeDocument {
  return {
    version: tree.version,
    nodes: mapLeaves(tree.nodes, (step) => freezeLeafTarget(step, ctx)),
  };
}

export function treeHasRelativeTargets(nodes: WorkoutNode[]): boolean {
  let found = false;
  walkLeaves(nodes, (step) => {
    if (step.target.mode === "relative") found = true;
  });
  return found;
}

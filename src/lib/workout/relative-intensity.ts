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

export const HR_REFS = ["lthr", "max"] as const;
export type HrRef = (typeof HR_REFS)[number];

export function isHrRef(raw: string): raw is HrRef {
  return (HR_REFS as readonly string[]).includes(raw);
}

/** Bare / omitted HR ref stays LTHR so existing `80%` plans do not retarget. */
export function hrRefFromTarget(target: Pick<StepTarget, "ref">): HrRef {
  return target.ref === "max" ? "max" : "lthr";
}

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
  /** True when any relative HR step needs LTHR. */
  needsLthr: boolean;
};

export type RelativeThresholdContext = RelativePaceContext & {
  ftpWatts?: number | null;
  maxHeartRateBpm?: number | null;
  lthrBpm?: number | null;
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
    if (t.ref === "lthr" || t.ref === "max") return;
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
  if (target.ref === "lthr" || target.ref === "max") return true;
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
  let needsLthr = false;

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
      if (hrRefFromTarget(t) === "max") {
        const maxHr = ctx.maxHeartRateBpm;
        if (maxHr == null || !(maxHr > 0)) needsMaxHr = true;
      } else {
        const lthr = ctx.lthrBpm;
        if (lthr == null || !(lthr > 0)) needsLthr = true;
      }
    }
  });

  return { pace, needsFtp, needsMaxHr, needsLthr };
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
  if (missing.needsLthr) {
    lines.push("Set LTHR (Settings → Thresholds)");
  }
  if (missing.needsMaxHr) {
    lines.push("Set max heart rate (Settings → Thresholds)");
  }
  // Dedupe while preserving order
  return [...new Set(lines)];
}

export function parseRelativeHrToken(
  raw: string
): { pct: number; ref?: HrRef } | string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!trimmed) return "relative heart_rate target must be a percent like 80% or 80%|max";

  const pipe = trimmed.match(/^(\d+(?:\.\d+)?)\s*%?\s*[|]\s*([a-z0-9]+)$/);
  if (pipe) {
    const pct = Number(pipe[1]);
    const ref = pipe[2]!;
    if (!isHrRef(ref)) {
      return `unknown heart-rate ref "${ref}" (use lthr or max)`;
    }
    if (!(pct > 0)) return "heart_rate percent must be positive";
    return { pct, ref };
  }

  const ofMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*%\s*(?:of\s+)?([a-z0-9]+)$/);
  if (ofMatch) {
    const pct = Number(ofMatch[1]);
    const ref = ofMatch[2]!;
    if (!isHrRef(ref)) {
      return `unknown heart-rate ref "${ref}" (use lthr or max)`;
    }
    if (!(pct > 0)) return "heart_rate percent must be positive";
    return { pct, ref };
  }

  const bare = trimmed.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (bare) {
    const pct = Number(bare[1]);
    if (!(pct > 0)) return "heart_rate percent must be positive";
    return { pct };
  }

  return "relative heart_rate target must be a percent like 80%, 80%|lthr, or 80%|max";
}

export function formatRelativeHrLabel(
  target: Pick<StepTarget, "pct" | "pctLow" | "pctHigh" | "ref">
): string {
  if (target.pctLow != null && target.pctHigh != null) {
    const suffix = hrRefFromTarget(target) === "max" ? "max HR" : "LTHR";
    return `${target.pctLow}–${target.pctHigh}% ${suffix}`;
  }
  const pct =
    target.pct != null && target.pct > 0 ? `${target.pct}%` : "100%";
  return hrRefFromTarget(target) === "max" ? `${pct} max HR` : `${pct} LTHR`;
}

export function formatRelativePowerLabel(
  target: Pick<StepTarget, "pct" | "pctLow" | "pctHigh">,
  ftpWatts?: number | null
): string {
  if (target.pctLow != null && target.pctHigh != null) {
    const base = `${target.pctLow}–${target.pctHigh}% FTP`;
    if (ftpWatts && ftpWatts > 0) {
      const low = Math.round((ftpWatts * target.pctLow) / 100);
      const high = Math.round((ftpWatts * target.pctHigh) / 100);
      return `${base} (${low}–${high}W)`;
    }
    return base;
  }
  const pct = target.pct != null && target.pct > 0 ? target.pct : 100;
  const base = `${pct}% FTP`;
  if (ftpWatts && ftpWatts > 0) {
    return `${base} (${Math.round((ftpWatts * pct) / 100)}W)`;
  }
  return base;
}

export function formatRelativePaceRangeLabel(
  target: Pick<StepTarget, "pctLow" | "pctHigh" | "ref" | "refSource">,
  ctx: RelativePaceContext,
  formatPaceFn?: (sec: number) => string
): string {
  const ref = target.ref;
  const refLabel =
    ref === "half" ? "HM" : ref === "threshold" ? "threshold" : ref ?? "threshold";
  const source =
    target.refSource === "goal" && ref !== "threshold" ? " goal" : "";
  const base = `${target.pctLow}–${target.pctHigh}% ${refLabel}${source} pace`;

  if (!ref || ref === "lthr" || ref === "max") return base;
  const anchor = resolveRelativePaceSeconds({ ref, refSource: target.refSource }, ctx);
  if (anchor == null || !(anchor > 0) || !target.pctLow || !target.pctHigh) return base;
  if (!formatPaceFn) return base;

  const slow = (anchor * 100) / target.pctLow;
  const fast = (anchor * 100) / target.pctHigh;
  return `${base} (${formatPaceFn(fast)}–${formatPaceFn(slow)})`;
}

/** Resolve a relative percent range to absolute low/high values. */
export function resolveRelativePercentRange(
  target: Pick<StepTarget, "signal" | "mode" | "pctLow" | "pctHigh" | "ref" | "refSource">,
  ctx: RelativeThresholdContext & RelativePaceContext
): { low: number; high: number } | null {
  if (target.mode !== "relative") return null;
  if (target.pctLow == null || target.pctHigh == null) return null;
  if (!(target.pctLow > 0) || !(target.pctHigh > 0)) return null;

  if (target.signal === "power") {
    const ftp = ctx.ftpWatts;
    if (ftp == null || !(ftp > 0)) return null;
    return {
      low: Math.round((ftp * target.pctLow) / 100),
      high: Math.round((ftp * target.pctHigh) / 100),
    };
  }
  if (target.signal === "heart_rate") {
    const anchor =
      hrRefFromTarget(target) === "max" ? ctx.maxHeartRateBpm : ctx.lthrBpm;
    if (anchor == null || !(anchor > 0)) return null;
    return {
      low: Math.round((anchor * target.pctLow) / 100),
      high: Math.round((anchor * target.pctHigh) / 100),
    };
  }
  if (target.signal === "pace" && target.ref && target.ref !== "lthr" && target.ref !== "max") {
    const anchor = resolveRelativePaceSeconds(
      { ref: target.ref, refSource: target.refSource },
      ctx
    );
    if (anchor == null || !(anchor > 0)) return null;
    // Higher pct = faster = fewer sec/km. low is slow end, high is fast end.
    return {
      low: Math.round((anchor * 100) / target.pctLow),
      high: Math.round((anchor * 100) / target.pctHigh),
    };
  }
  return null;
}

/** Resolve relative power (% FTP) or HR (% LTHR or % max) to absolute watts/bpm. */
export function resolveRelativePercentTarget(
  target: Pick<StepTarget, "signal" | "mode" | "pct" | "value" | "ref">,
  ctx: Pick<RelativeThresholdContext, "ftpWatts" | "maxHeartRateBpm" | "lthrBpm">
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
    const anchor =
      hrRefFromTarget(target) === "max" ? ctx.maxHeartRateBpm : ctx.lthrBpm;
    if (anchor == null || !(anchor > 0)) return null;
    return Math.round((anchor * pct) / 100);
  }
  return null;
}

function freezeLeafTarget(
  step: LeafStep,
  ctx: RelativeThresholdContext
): LeafStep {
  const t = step.target;
  if (t.mode !== "relative") return step;

  if (t.signal === "pace" && t.ref && t.ref !== "lthr" && t.ref !== "max") {
    if (t.pctLow != null && t.pctHigh != null) {
      const range = resolveRelativePercentRange(t, ctx);
      if (range == null) return step;
      return {
        ...step,
        target: { signal: "pace", mode: "range", low: range.high, high: range.low },
        targetPaceSeconds: range.high,
      };
    }
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
    if (t.pctLow != null && t.pctHigh != null) {
      const range = resolveRelativePercentRange(t, ctx);
      if (range == null) return step;
      return {
        ...step,
        target: { signal: t.signal, mode: "range", low: range.low, high: range.high },
      };
    }
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

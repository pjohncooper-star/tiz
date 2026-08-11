/**
 * Relative pace targets for run/swim workouts.
 * Store fitness-relative refs on the workout tree; resolve to absolute
 * seconds/km (run) or seconds/100m (swim) at display / FIT time.
 */

export const PACE_REFS = ["threshold", "5k", "10k", "half", "marathon"] as const;
export type PaceRef = (typeof PACE_REFS)[number];

export type PaceRefSource = "fitness" | "goal";

export type RelativePaceTarget = {
  signal: "pace";
  mode: "relative";
  /** Anchor pace (threshold or race distance). */
  ref: PaceRef;
  /**
   * Percent of anchor *speed* (same convention as pace zones).
   * 100 = exact anchor; 95 = slightly slower; 105 = slightly faster.
   * Omit for 100%.
   */
  pct?: number;
  /** Which athlete table to read for race refs. Default: fitness. */
  refSource?: PaceRefSource;
};

/** Canonical sec/km (run) or sec/100m (swim) for each race anchor. */
export type RacePaceAnchors = {
  "5k"?: number | null;
  "10k"?: number | null;
  half?: number | null;
  marathon?: number | null;
  /** Optional goal-race paces (marathon plan "MP"). */
  goal5k?: number | null;
  goal10k?: number | null;
  goalHalf?: number | null;
  goalMarathon?: number | null;
};

export type RelativePaceContext = {
  /** Current threshold pace (sec/km or sec/100m). */
  thresholdPaceSeconds?: number | null;
  racePaces?: RacePaceAnchors | null;
};

export function isPaceRef(raw: string): raw is PaceRef {
  return (PACE_REFS as readonly string[]).includes(raw);
}

export function parseRacePaceAnchors(raw: unknown): RacePaceAnchors {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: RacePaceAnchors = {};
  for (const key of [
    "5k",
    "10k",
    "half",
    "marathon",
    "goal5k",
    "goal10k",
    "goalHalf",
    "goalMarathon",
  ] as const) {
    const n = Number(o[key]);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

export function serializeRacePaceAnchors(
  anchors: RacePaceAnchors
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(anchors)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

function anchorSeconds(
  ref: PaceRef,
  refSource: PaceRefSource,
  ctx: RelativePaceContext
): number | null {
  if (ref === "threshold") {
    const t = ctx.thresholdPaceSeconds;
    return t != null && t > 0 ? t : null;
  }
  const paces = ctx.racePaces ?? {};
  if (refSource === "goal") {
    const goalKey =
      ref === "5k"
        ? "goal5k"
        : ref === "10k"
          ? "goal10k"
          : ref === "half"
            ? "goalHalf"
            : "goalMarathon";
    const g = paces[goalKey];
    if (g != null && g > 0) return g;
    // Fall back to fitness anchor if goal unset.
  }
  const fitness = paces[ref];
  return fitness != null && fitness > 0 ? fitness : null;
}

/**
 * Resolve a relative pace target to canonical pace seconds.
 * pct is % of anchor speed: resolved = anchorSeconds * 100 / pct.
 */
export function resolveRelativePaceSeconds(
  target: Pick<RelativePaceTarget, "ref" | "pct" | "refSource">,
  ctx: RelativePaceContext
): number | null {
  const source = target.refSource ?? "fitness";
  const anchor = anchorSeconds(target.ref, source, ctx);
  if (anchor == null) return null;
  const pct = target.pct != null && target.pct > 0 ? target.pct : 100;
  return (anchor * 100) / pct;
}

/**
 * Parse CSV `target` token for relative mode.
 * Accepts: `10k`, `threshold`, `95%|10k`, `95% of 10k`, `1.05|half`
 */
export function parseRelativePaceToken(
  raw: string
): { ref: PaceRef; pct?: number } | string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!trimmed) return "relative target requires a pace ref (e.g. 10k, threshold)";

  const pipe = trimmed.match(/^(\d+(?:\.\d+)?)\s*%?\s*[|]\s*([a-z0-9]+)$/);
  if (pipe) {
    const pct = Number(pipe[1]);
    const ref = pipe[2]!;
    if (!isPaceRef(ref)) {
      return `unknown pace ref "${ref}" (use threshold, 5k, 10k, half, marathon)`;
    }
    if (!(pct > 0)) return "relative percent must be positive";
    return { ref, pct };
  }

  const ofMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s*%\s*(?:of\s+)?([a-z0-9]+)$/
  );
  if (ofMatch) {
    const pct = Number(ofMatch[1]);
    const ref = ofMatch[2]!;
    if (!isPaceRef(ref)) {
      return `unknown pace ref "${ref}" (use threshold, 5k, 10k, half, marathon)`;
    }
    if (!(pct > 0)) return "relative percent must be positive";
    return { ref, pct };
  }

  if (isPaceRef(trimmed)) return { ref: trimmed };
  return `unknown relative pace "${raw}" (use 10k, threshold, or 95%|10k)`;
}

export function formatRelativePaceLabel(
  target: Pick<RelativePaceTarget, "ref" | "pct" | "refSource">
): string {
  const pct =
    target.pct != null && target.pct > 0 && target.pct !== 100
      ? `${target.pct}% `
      : "";
  const source =
    target.refSource === "goal" && target.ref !== "threshold" ? " goal" : "";
  const refLabel =
    target.ref === "half"
      ? "HM"
      : target.ref === "threshold"
        ? "threshold"
        : target.ref;
  return `${pct}${refLabel}${source} pace`;
}

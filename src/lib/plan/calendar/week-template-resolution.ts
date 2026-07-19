/**
 * Per-week resolution for phase-aware weekly templates.
 *
 * Pure precedence logic shared by the calendar materializer (S5) and the
 * planner UI. Given a week's context (scheduled test week, de-load flag) and
 * which templates the plan has defined, decide which template — if any —
 * materializes onto that week, and how TiZ is treated.
 *
 * Precedence (see docs/plan-wizard-weekly-template-strategy.md):
 *   scheduled test week  → test template   · TiZ suppressed
 *   de-load / rest week  → rest template if defined, else phase template
 *   normal week          → phase template if defined, else nothing
 *
 * Templates are never mandatory: when no template is defined for a week the
 * result is `NONE` and the week stays empty (slot-budget chips only).
 */

export type ResolvedTemplateKind = "PHASE" | "REST" | "TEST" | "NONE";

export type WeekTemplateResolutionInput = {
  /** Week is a scheduled test week (from SeasonPlan.testWeekFlags). */
  isTestWeek: boolean;
  /** Week is a de-load / rest week (from SeasonPlan.deLoadWeekFlags). */
  isDeLoadWeek: boolean;
  /** The week's phase has a PHASE template defined. */
  hasPhaseTemplate: boolean;
  /** The season plan has a REST template defined. */
  hasRestTemplate: boolean;
  /** The season plan has a TEST template defined. */
  hasTestTemplate: boolean;
};

export type WeekTemplateResolution = {
  /** Which template materializes onto the week (NONE = leave empty). */
  kind: ResolvedTemplateKind;
  /**
   * TiZ planning is suppressed for the week (test weeks sit outside the TiZ
   * system). Surviving long workouts may still carry TiZ in mode 4; that is a
   * materialize-time detail, not decided here.
   */
  suppressTiz: boolean;
  /**
   * The de-load engine still owns the week's reduced volume/zone budget; the
   * template only lays out the (already scaled) week.
   */
  deLoadScaled: boolean;
};

/** Resolve which template governs a week and how its TiZ is treated. */
export function resolveWeekTemplateKind(
  input: WeekTemplateResolutionInput
): WeekTemplateResolution {
  // Test weeks win over everything (a week may be flagged both test + de-load).
  if (input.isTestWeek) {
    return {
      kind: input.hasTestTemplate ? "TEST" : "NONE",
      suppressTiz: true,
      deLoadScaled: false,
    };
  }

  if (input.isDeLoadWeek) {
    const kind: ResolvedTemplateKind = input.hasRestTemplate
      ? "REST"
      : input.hasPhaseTemplate
        ? "PHASE"
        : "NONE";
    return { kind, suppressTiz: false, deLoadScaled: true };
  }

  return {
    kind: input.hasPhaseTemplate ? "PHASE" : "NONE",
    suppressTiz: false,
    deLoadScaled: false,
  };
}

/** Parse a stored `testWeekFlags` JSON value into a boolean[] (or null). */
export function parseTestWeekFlags(value: unknown): boolean[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((flag) => typeof flag === "boolean")) return null;
  return value;
}

/** All-off test-week flags for a season of `totalWeeks` weeks. */
export function initialTestWeekFlags(totalWeeks: number): boolean[] {
  return Array.from({ length: Math.max(0, totalWeeks) }, () => false);
}

/**
 * Resolve stored test-week flags to exactly `totalWeeks` entries, padding new
 * weeks with `false` and truncating extras. Mirrors long-week flag handling.
 */
export function resolveTestWeekFlagsForSeason(input: {
  totalWeeks: number;
  stored: unknown;
}): boolean[] {
  const parsed = parseTestWeekFlags(input.stored);
  const result = initialTestWeekFlags(input.totalWeeks);
  if (parsed) {
    for (let i = 0; i < Math.min(parsed.length, input.totalWeeks); i++) {
      result[i] = parsed[i]!;
    }
  }
  return result;
}

/** Whether a given week index is a scheduled test week. */
export function isTestWeekAtIndex(weekIndex: number, stored: unknown): boolean {
  const parsed = parseTestWeekFlags(stored);
  if (!parsed) return false;
  return parsed[weekIndex] === true;
}

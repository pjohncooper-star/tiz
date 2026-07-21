/** Sticky toolbar offset used for focused-week detection and week scroll targets. */
export const FOCUS_TOP_OFFSET_PX = 72;

/** Small tolerance so sub-pixel sticky alignment still counts as fully visible. */
export const FULLY_VISIBLE_TOP_SLOP_PX = 8;

/**
 * Effective sticky chrome height: page header plus optional Week TiZ editor band
 * when the wizard layout pins that band below the header.
 */
export function calendarStickyOffsetPx(options: {
  editorBandHeightPx: number;
  includeEditorBand: boolean;
}): number {
  const band = options.includeEditorBand
    ? Math.max(0, options.editorBandHeightPx)
    : 0;
  return FOCUS_TOP_OFFSET_PX + band;
}

export type WeekTop = {
  weekStart: string;
  top: number;
};

/**
 * Pick the first week whose top is not clipped under sticky chrome
 * (top at or below the sticky offset). Among those, choose the topmost
 * (smallest `top`). If none qualify, fall back to the week nearest the offset.
 */
export function pickFirstFullyVisibleWeek(
  weekTops: WeekTop[],
  stickyOffset: number,
  slop: number = FULLY_VISIBLE_TOP_SLOP_PX
): string | null {
  if (weekTops.length === 0) return null;

  let bestFullyVisible: string | null = null;
  let bestFullyVisibleTop = Number.POSITIVE_INFINITY;

  let bestFallback: string | null = null;
  let bestFallbackDistance = Number.POSITIVE_INFINITY;

  for (const { weekStart, top } of weekTops) {
    const distance = Math.abs(top - stickyOffset);
    if (distance < bestFallbackDistance) {
      bestFallbackDistance = distance;
      bestFallback = weekStart;
    }

    if (top >= stickyOffset - slop && top < bestFullyVisibleTop) {
      bestFullyVisibleTop = top;
      bestFullyVisible = weekStart;
    }
  }

  return bestFullyVisible ?? bestFallback;
}

/** Scroll so the element's top sits just below sticky chrome. */
export function scrollElementBelowSticky(
  el: Element,
  stickyOffset: number,
  behavior: ScrollBehavior = "smooth"
): void {
  const top = window.scrollY + el.getBoundingClientRect().top - stickyOffset;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

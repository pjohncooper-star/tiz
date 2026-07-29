/** Sticky toolbar offset used for focused-week detection and week scroll targets. */
export const FOCUS_TOP_OFFSET_PX = 72;

/** Fixed app header height (`h-12` in AppSidebarClient), all breakpoints. */
export const APP_HEADER_PX = 48;

/** @deprecated Use APP_HEADER_PX — header is no longer mobile-only. */
export const MOBILE_APP_HEADER_PX = APP_HEADER_PX;

/** Small tolerance so sub-pixel sticky alignment still counts as fully visible. */
export const FULLY_VISIBLE_TOP_SLOP_PX = 8;

/**
 * Effective sticky chrome height: app header, calendar toolbar,
 * plus optional Week TiZ editor band when the wizard layout pins that band.
 */
export function calendarStickyOffsetPx(options: {
  editorBandHeightPx: number;
  includeEditorBand: boolean;
  /** Measured sticky toolbar height; defaults to FOCUS_TOP_OFFSET_PX. */
  toolbarHeightPx?: number;
  /** Fixed app header height; defaults to APP_HEADER_PX. */
  appHeaderPx?: number;
  /** @deprecated Prefer appHeaderPx. */
  mobileHeaderPx?: number;
}): number {
  const toolbar =
    options.toolbarHeightPx != null
      ? Math.max(0, options.toolbarHeightPx)
      : FOCUS_TOP_OFFSET_PX;
  const appHeader = Math.max(
    0,
    options.appHeaderPx ?? options.mobileHeaderPx ?? APP_HEADER_PX
  );
  const band = options.includeEditorBand
    ? Math.max(0, options.editorBandHeightPx)
    : 0;
  return appHeader + toolbar + band;
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

/**
 * Sticky week title height inside a week section, if present.
 * Used when scrolling to a day column in the stacked (narrow) day list.
 */
export function stickyWeekHeaderHeightPx(fromEl: Element): number {
  const weekSection = fromEl.closest("[data-week-start]");
  const header = weekSection?.querySelector("h2");
  if (!(header instanceof HTMLElement)) return 0;
  return header.getBoundingClientRect().height;
}

/** Scroll a day column so it is the first full day below sticky chrome + week title. */
export function scrollDateBelowSticky(
  dateKey: string,
  stickyOffset: number,
  behavior: ScrollBehavior = "smooth"
): boolean {
  const dayEl = document.querySelector(`[data-date-key="${dateKey}"]`);
  if (!(dayEl instanceof HTMLElement)) return false;
  scrollElementBelowSticky(
    dayEl,
    stickyOffset + stickyWeekHeaderHeightPx(dayEl),
    behavior
  );
  return true;
}

/** xl and up: horizontal week row. Below xl: vertical day stack. */
export function isCalendarWeekRowLayout(): boolean {
  return window.matchMedia("(min-width: 1280px)").matches;
}

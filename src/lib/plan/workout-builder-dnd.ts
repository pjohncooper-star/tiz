export const ASSEMBLED_WORKOUT_DRAG_ID = "assembled-workout";

/** @deprecated Use `POOL_SUGGESTED_DRAG_PREFIX` — kept for in-flight drags. */
export const SEASON_PALETTE_DRAG_PREFIX = "season-palette:";

export const POOL_UNSCHEDULED_DRAG_PREFIX = "pool-unscheduled:";
export const POOL_ARMED_UNSCHEDULED_DRAG_PREFIX = "pool-armed-unscheduled:";
export const POOL_UNSCHEDULED_DROP_PREFIX = "pool-unscheduled-drop:";
export const POOL_SUGGESTED_DRAG_PREFIX = "pool-suggested:";
export const POOL_LIBRARY_DRAG_PREFIX = "pool-library:";

export function seasonPaletteDragId(cardId: string): string {
  return poolSuggestedDragId(cardId);
}

export function poolSuggestedDragId(cardId: string): string {
  return `${POOL_SUGGESTED_DRAG_PREFIX}${cardId}`;
}

export function poolUnscheduledDragId(chipId: string): string {
  return `${POOL_UNSCHEDULED_DRAG_PREFIX}${chipId}`;
}

export function poolArmedUnscheduledDragId(chipId: string): string {
  return `${POOL_ARMED_UNSCHEDULED_DRAG_PREFIX}${chipId}`;
}

export function poolUnscheduledDropId(chipId: string): string {
  return `${POOL_UNSCHEDULED_DROP_PREFIX}${chipId}`;
}

export function isPoolUnscheduledDrop(id: string | number): boolean {
  return String(id).startsWith(POOL_UNSCHEDULED_DROP_PREFIX);
}

export function isPoolArmedUnscheduledDrag(id: string | number): boolean {
  return String(id).startsWith(POOL_ARMED_UNSCHEDULED_DRAG_PREFIX);
}

export function poolLibraryDragId(templateId: string): string {
  return `${POOL_LIBRARY_DRAG_PREFIX}${templateId}`;
}

export function parsePoolLibraryDragId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith(POOL_LIBRARY_DRAG_PREFIX)) return null;
  return s.slice(POOL_LIBRARY_DRAG_PREFIX.length) || null;
}

export function isPoolLibraryDrag(id: string | number): boolean {
  return String(id).startsWith(POOL_LIBRARY_DRAG_PREFIX);
}

export function parsePoolUnscheduledDragId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith(POOL_UNSCHEDULED_DRAG_PREFIX)) return null;
  return s.slice(POOL_UNSCHEDULED_DRAG_PREFIX.length) || null;
}

export function isPoolUnscheduledDrag(id: string | number): boolean {
  return String(id).startsWith(POOL_UNSCHEDULED_DRAG_PREFIX);
}

export function parseSeasonPaletteDragId(id: string | number): string | null {
  return parsePoolSuggestedDragId(id);
}

export function parsePoolSuggestedDragId(id: string | number): string | null {
  const s = String(id);
  if (s.startsWith(POOL_SUGGESTED_DRAG_PREFIX)) {
    return s.slice(POOL_SUGGESTED_DRAG_PREFIX.length) || null;
  }
  if (s.startsWith(SEASON_PALETTE_DRAG_PREFIX)) {
    return s.slice(SEASON_PALETTE_DRAG_PREFIX.length) || null;
  }
  return null;
}

export function isSeasonPaletteDrag(id: string | number): boolean {
  return isPoolSuggestedDrag(id);
}

export function isPoolSuggestedDrag(id: string | number): boolean {
  const s = String(id);
  return s.startsWith(POOL_SUGGESTED_DRAG_PREFIX) || s.startsWith(SEASON_PALETTE_DRAG_PREFIX);
}

export function parseComponentLibraryDragId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith("component:")) return null;
  return s.slice("component:".length) || null;
}

export function parsePaletteItemDragId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith("palette:")) return null;
  return s.slice("palette:".length) || null;
}

export function parseWorkoutSessionDropId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith("workout:")) return null;
  return s.slice("workout:".length) || null;
}

export function isAssembledWorkoutDrag(id: string | number): boolean {
  return String(id) === ASSEMBLED_WORKOUT_DRAG_ID;
}

/** Drags that place pool content onto the calendar grid (subject to pool-week gating). */
export function isPoolPlacementDragId(id: string | number): boolean {
  const s = String(id);
  return (
    isPoolUnscheduledDrag(s) ||
    isPoolArmedUnscheduledDrag(s) ||
    isPoolSuggestedDrag(s) ||
    isPoolLibraryDrag(s) ||
    isAssembledWorkoutDrag(s)
  );
}

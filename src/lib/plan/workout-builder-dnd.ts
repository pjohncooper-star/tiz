export const ASSEMBLED_WORKOUT_DRAG_ID = "assembled-workout";

export const SEASON_PALETTE_DRAG_PREFIX = "season-palette:";

export function seasonPaletteDragId(cardId: string): string {
  return `${SEASON_PALETTE_DRAG_PREFIX}${cardId}`;
}

export function parseSeasonPaletteDragId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith(SEASON_PALETTE_DRAG_PREFIX)) return null;
  return s.slice(SEASON_PALETTE_DRAG_PREFIX.length) || null;
}

export function isSeasonPaletteDrag(id: string | number): boolean {
  return String(id).startsWith(SEASON_PALETTE_DRAG_PREFIX);
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

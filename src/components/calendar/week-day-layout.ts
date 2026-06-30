/** Flex child class for a 7-day row: selected day is 1.5×, others share remaining width (horizontal only). */
export function weekDayColumnClass(isSelected: boolean): string {
  const base = "min-w-0 w-full transition-[flex] duration-200 ease-out";
  return isSelected ? `${base} xl:flex-[1.5]` : `${base} xl:flex-1`;
}

/** Vertical day stack on small/medium viewports; horizontal week row on xl+. */
export const WEEK_DAY_ROW_CLASS = "flex flex-col gap-2 xl:flex-row xl:gap-2";

/** Column headers for horizontal layout only (each day card labels itself when stacked). */
export const WEEK_DAY_HEADER_ROW_CLASS =
  "mb-1 hidden text-center text-xs font-medium text-zinc-500 xl:flex xl:gap-2";

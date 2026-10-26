export type MovableTemplateItem = {
  key: string;
  weekday: string;
  sortOrder: number;
};

function byOrder<T extends MovableTemplateItem>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder;
}

/**
 * Move one session to `weekday` so it lands at `index` in that day's current order.
 * `index` counts the moving session too when it already sits on that day (a drop
 * position, 0..length). Both affected days are renumbered 0..n-1.
 */
export function moveTemplateItem<T extends MovableTemplateItem>(
  items: T[],
  key: string,
  weekday: T["weekday"],
  index: number
): T[] {
  const moving = items.find((item) => item.key === key);
  if (!moving) return items;

  const sourceDay = items.filter((item) => item.weekday === moving.weekday).sort(byOrder);
  const fromIndex = sourceDay.findIndex((item) => item.key === key);
  const sameDay = moving.weekday === weekday;

  let target = index;
  if (sameDay && fromIndex < index) target -= 1;
  if (sameDay && target === fromIndex) return items;

  const dest = items
    .filter((item) => item.weekday === weekday && item.key !== key)
    .sort(byOrder);
  target = Math.max(0, Math.min(target, dest.length));
  dest.splice(target, 0, moving);

  const order = new Map<string, number>();
  dest.forEach((item, position) => order.set(item.key, position));
  if (!sameDay) {
    sourceDay
      .filter((item) => item.key !== key)
      .forEach((item, position) => order.set(item.key, position));
  }

  return items.map((item) => {
    const sortOrder = order.get(item.key);
    if (item.key === key) return { ...item, weekday, sortOrder: sortOrder! };
    if (sortOrder == null || sortOrder === item.sortOrder) return item;
    return { ...item, sortOrder };
  });
}

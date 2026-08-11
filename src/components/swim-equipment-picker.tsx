"use client";

import { Label } from "@/components/ui";
import type { SwimEquipmentCatalog } from "@/lib/swim/equipment-catalog";

type SwimEquipmentPickerProps = {
  catalog: SwimEquipmentCatalog;
  value: readonly string[] | undefined;
  onChange: (ids: string[] | undefined) => void;
  dense?: boolean;
};

/** Multi-select toggles for swim step equipment (catalog ids). */
export function SwimEquipmentPicker({
  catalog,
  value,
  onChange,
  dense = false,
}: SwimEquipmentPickerProps) {
  if (catalog.length === 0) return null;
  const selected = new Set(value ?? []);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const ordered = catalog.map((e) => e.id).filter((eid) => next.has(eid));
    // Keep unknown ids that were already on the step so deletes don't wipe them.
    for (const existing of value ?? []) {
      if (!catalog.some((e) => e.id === existing) && next.has(existing)) {
        ordered.push(existing);
      }
    }
    onChange(ordered.length > 0 ? ordered : undefined);
  }

  // Surface unknown ids still attached to the step.
  const unknown = (value ?? []).filter((id) => !catalog.some((e) => e.id === id));

  return (
    <div className="w-full min-w-0">
      <Label>Equipment</Label>
      <div className={`flex flex-wrap ${dense ? "gap-1" : "gap-1.5"}`}>
        {catalog.map((entry) => {
          const on = selected.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(entry.id)}
              className={`rounded border px-2 py-0.5 text-left ${
                dense ? "text-[10px]" : "text-xs"
              } ${
                on
                  ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
              }`}
            >
              {entry.name}
            </button>
          );
        })}
        {unknown.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed
            onClick={() => toggle(id)}
            className={`rounded border border-amber-500 bg-amber-500 px-2 py-0.5 text-white ${
              dense ? "text-[10px]" : "text-xs"
            }`}
            title="No longer in your equipment list — click to remove"
          >
            {id}
          </button>
        ))}
      </div>
    </div>
  );
}

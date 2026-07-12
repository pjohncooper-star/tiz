"use client";

import type { ZoneFocusCatalog, ZoneFocusDefinition } from "@/lib/plan/season/zone-focus-catalog";
import { defaultNewZoneFocus } from "@/lib/plan/season/zone-focus-catalog";
import { normalizeZoneSplitPercents } from "@/lib/plan/season/phase-zone-defaults";
import type { ZoneSplitPercents } from "@/lib/plan/season/zone-split-types";
import { Button, Input } from "@/components/ui";

type ZoneFocusCatalogEditorProps = {
  value: ZoneFocusCatalog;
  onChange: (value: ZoneFocusCatalog) => void;
};

export function ZoneFocusCatalogEditor({ value, onChange }: ZoneFocusCatalogEditorProps) {
  function updateEntry(id: string, patch: Partial<ZoneFocusDefinition>) {
    onChange(value.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function updatePercents(id: string, patch: Partial<ZoneSplitPercents>) {
    onChange(
      value.map((entry) => {
        if (entry.id !== id) return entry;
        return {
          ...entry,
          percents: normalizeZoneSplitPercents({ ...entry.percents, ...patch }),
        };
      })
    );
  }

  function removeEntry(id: string) {
    if (value.length <= 1) return;
    onChange(value.filter((entry) => entry.id !== id));
  }

  function addEntry() {
    onChange([...value, defaultNewZoneFocus(value)]);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Define what each training focus means as Z1–Z5 % of discipline time. These presets appear in
        phase-kind defaults and per-phase zone focus dropdowns.
      </p>
      <div className="space-y-3">
        {value.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-[12rem] flex-1"
                value={entry.name}
                onChange={(event) => updateEntry(entry.id, { name: event.target.value })}
                aria-label="Focus name"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={value.length <= 1}
                onClick={() => removeEntry(entry.id)}
              >
                Delete
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {(["z1", "z2", "z3", "z4", "z5"] as const).map((key, index) => (
                <div key={key}>
                  <span className="text-xs uppercase text-zinc-500">Z{index + 1} %</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1"
                    value={entry.percents[key]}
                    onChange={(event) =>
                      updatePercents(entry.id, { [key]: Number(event.target.value) || 0 })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button type="button" variant="secondary" onClick={addEntry}>
        Add focus
      </Button>
    </div>
  );
}

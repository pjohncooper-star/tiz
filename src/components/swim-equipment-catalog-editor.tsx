"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import {
  defaultNewSwimEquipment,
  type SwimEquipmentCatalog,
  type SwimEquipmentDefinition,
} from "@/lib/swim/equipment-catalog";

type SwimEquipmentCatalogEditorProps = {
  value: SwimEquipmentCatalog;
  onChange: (value: SwimEquipmentCatalog) => void;
};

export function SwimEquipmentCatalogEditor({
  value,
  onChange,
}: SwimEquipmentCatalogEditorProps) {
  function updateEntry(id: string, patch: Partial<SwimEquipmentDefinition>) {
    onChange(value.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function removeEntry(id: string) {
    if (value.length <= 1) return;
    onChange(value.filter((entry) => entry.id !== id));
  }

  function addEntry() {
    onChange([...value, defaultNewSwimEquipment(value)]);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        These options appear as a multi-select on swim workout steps. Renaming keeps existing
        workouts linked by id; deleting only hides the option from new picks.
      </p>
      <div className="space-y-2">
        {value.map((entry) => (
          <div key={entry.id} className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[12rem] flex-1"
              value={entry.name}
              onChange={(event) => updateEntry(entry.id, { name: event.target.value })}
              aria-label="Equipment name"
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
        ))}
      </div>
      <Button type="button" variant="secondary" onClick={addEntry}>
        Add equipment
      </Button>
    </div>
  );
}

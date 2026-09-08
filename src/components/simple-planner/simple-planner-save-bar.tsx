"use client";

import { Button } from "@/components/ui";

export function SimplePlannerSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty && !saving) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:mx-0 md:rounded-t-lg">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-sm text-zinc-500">
          {saving ? "Saving…" : "Unsaved changes"}
        </p>
        <Button type="button" variant="secondary" disabled={saving} onClick={onDiscard}>
          Discard
        </Button>
        <Button type="button" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

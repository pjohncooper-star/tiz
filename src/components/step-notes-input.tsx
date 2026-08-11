"use client";

import { Label } from "@/components/ui";
import { TextEditorInput } from "@/components/number-editor-input";

type StepNotesInputProps = {
  value: string | undefined;
  onCommit: (notes: string | undefined) => void;
  dense?: boolean;
};

/** Blur-commit notes field for workout tree nodes. Empty clears notes. */
export function StepNotesInput({ value, onCommit, dense = false }: StepNotesInputProps) {
  return (
    <div className="w-full min-w-0">
      <Label>Notes</Label>
      <TextEditorInput
        value={value ?? ""}
        allowEmpty
        placeholder="Optional notes"
        ariaLabel="Step notes"
        className={dense ? "text-xs" : undefined}
        onCommit={(next) => onCommit(next.trim() ? next.trim() : undefined)}
      />
    </div>
  );
}

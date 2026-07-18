"use client";

import { useEffect, useState } from "react";
import { Input, Label } from "@/components/ui";

export type NumberEditorInputProps = {
  value: number;
  onCommit: (value: number) => void;
  label?: string;
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number | string;
  /** When false, allows decimal input (default true). */
  integer?: boolean;
  formatDisplay?: (value: number) => string;
};

function defaultFormat(value: number): string {
  return String(value);
}

export function NumberEditorInput({
  value,
  onCommit,
  label,
  ariaLabel,
  min,
  max,
  step,
  integer = true,
  formatDisplay = defaultFormat,
}: NumberEditorInputProps) {
  const [text, setText] = useState(() => formatDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatDisplay(value));
  }, [value, focused, formatDisplay]);

  function parseInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = integer ? parseInt(trimmed, 10) : Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function isValid(n: number): boolean {
    if (min != null && n < min) return false;
    if (max != null && n > max) return false;
    if (integer && !Number.isInteger(n)) return false;
    return true;
  }

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) {
      setText(formatDisplay(value));
      return;
    }
    const parsed = parseInput(trimmed);
    if (parsed != null && isValid(parsed)) {
      onCommit(parsed);
      setText(formatDisplay(parsed));
      return;
    }
    setText(formatDisplay(value));
  }

  const input = (
    <Input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={step}
      value={text}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );

  if (!label) return input;
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      {input}
    </div>
  );
}

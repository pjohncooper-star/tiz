"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";
import { Input, Label } from "@/components/ui";

type SharedInputProps = {
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
};

function blurOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.currentTarget.blur();
}

export type NumberEditorInputProps = SharedInputProps & {
  value: number | null;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number | string;
  /** When false, allows decimal input (default true). */
  integer?: boolean;
  formatDisplay?: (value: number) => string;
  /** When true, empty blur commits null; otherwise reverts (default false). */
  nullable?: boolean;
};

function defaultFormat(value: number): string {
  return String(value);
}

function formatNumberValue(
  value: number | null,
  formatDisplay: (value: number) => string
): string {
  if (value == null) return "";
  return formatDisplay(value);
}

export function NumberEditorInput({
  value,
  onCommit,
  label,
  ariaLabel,
  placeholder,
  className,
  min,
  max,
  step,
  integer = true,
  formatDisplay = defaultFormat,
  nullable = false,
  inputMode,
}: NumberEditorInputProps) {
  const [text, setText] = useState(() => formatNumberValue(value, formatDisplay));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatNumberValue(value, formatDisplay));
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
      if (nullable) {
        onCommit(null);
        setText("");
      } else {
        setText(formatNumberValue(value, formatDisplay));
      }
      return;
    }
    const parsed = parseInput(trimmed);
    if (parsed != null && isValid(parsed)) {
      onCommit(parsed);
      setText(formatDisplay(parsed));
      return;
    }
    setText(formatNumberValue(value, formatDisplay));
  }

  const input = (
    <Input
      type="text"
      inputMode={inputMode ?? (integer ? "numeric" : "decimal")}
      min={min}
      max={max}
      step={step}
      value={text}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={blurOnEnter}
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

export type TextEditorInputProps = SharedInputProps & {
  value: string;
  onCommit: (value: string) => void;
  /** When false, empty blur reverts instead of committing (default true). */
  allowEmpty?: boolean;
  validate?: (raw: string) => boolean;
};

export function TextEditorInput({
  value,
  onCommit,
  label,
  ariaLabel,
  placeholder,
  className,
  inputMode = "text",
  allowEmpty = true,
  validate,
}: TextEditorInputProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) {
      if (allowEmpty) {
        onCommit("");
        setText("");
      } else {
        setText(value);
      }
      return;
    }
    if (validate && !validate(trimmed)) {
      setText(value);
      return;
    }
    onCommit(trimmed);
    setText(trimmed);
  }

  const input = (
    <Input
      type="text"
      inputMode={inputMode}
      value={text}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={className}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={blurOnEnter}
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

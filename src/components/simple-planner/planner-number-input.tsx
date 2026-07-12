"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import {
  distanceDisplayToMeters,
  distanceMetersToDisplay,
} from "./simple-planner-volume-display";

export type EditableNumberOptions = {
  min?: number;
  max?: number;
  integer?: boolean;
};

function formatEditableNumber(value: number, integer: boolean): string {
  return integer ? String(Math.round(value)) : String(value);
}

function parseEditableNumber(text: string, integer: boolean): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = integer ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function clampNumber(n: number, min?: number, max?: number): number {
  let next = n;
  if (min != null) next = Math.max(min, next);
  if (max != null) next = Math.min(max, next);
  return next;
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

type EditableFieldBindings = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function useEditableParsedField<T>({
  value,
  format,
  parse,
  onChange,
  allowEmpty = false,
  onEmpty,
}: {
  value: T;
  format: (value: T) => string;
  parse: (text: string) => T | null;
  onChange: (value: T) => void;
  allowEmpty?: boolean;
  onEmpty?: () => void;
}): EditableFieldBindings {
  const [text, setText] = useState(() => format(value));
  const focusedRef = useRef(false);
  const formatRef = useRef(format);
  const parseRef = useRef(parse);
  formatRef.current = format;
  parseRef.current = parse;

  useEffect(() => {
    if (focusedRef.current) return;
    setText(formatRef.current(value));
  }, [value]);

  function commit(nextText: string) {
    const trimmed = nextText.trim();
    if (!trimmed) {
      if (allowEmpty && onEmpty) {
        onEmpty();
        setText("");
        return;
      }
      setText(formatRef.current(value));
      return;
    }
    const parsed = parseRef.current(trimmed);
    if (parsed == null) {
      setText(formatRef.current(value));
      return;
    }
    onChange(parsed);
    setText(formatRef.current(parsed));
  }

  return {
    value: text,
    onChange: (event) => setText(event.target.value),
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: () => {
      focusedRef.current = false;
      commit(text);
    },
    onKeyDown: blurOnEnter,
  };
}

export function useEditableNumber(
  value: number,
  onChange: (value: number) => void,
  options: EditableNumberOptions = {}
): EditableFieldBindings {
  const { min, max, integer = false } = options;
  return useEditableParsedField({
    value,
    format: (next) => formatEditableNumber(next, integer),
    parse: (text) => {
      const parsed = parseEditableNumber(text, integer);
      if (parsed == null) return null;
      return clampNumber(parsed, min, max);
    },
    onChange,
  });
}

export function useEditableDistance(
  meters: number | null | undefined,
  discipline: "SWIM" | "RUN",
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>,
  onChange: (meters: number) => void
): EditableFieldBindings {
  const resolvedMeters = meters ?? 0;
  return useEditableParsedField({
    value: resolvedMeters,
    format: (next) => distanceMetersToDisplay(next, discipline, disciplineSettings),
    parse: (text) => distanceDisplayToMeters(text, discipline, disciplineSettings),
    onChange,
  });
}

export type PlannerNumberInputProps = EditableNumberOptions & {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
};

export function PlannerNumberInput({
  value,
  onChange,
  min,
  max,
  integer,
  className,
  disabled,
}: PlannerNumberInputProps) {
  const field = useEditableNumber(value, onChange, { min, max, integer });
  return (
    <Input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      className={className}
      disabled={disabled}
      {...field}
    />
  );
}

export type PlannerDistanceInputProps = {
  value: number | null | undefined;
  discipline: "SWIM" | "RUN";
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onChange: (meters: number) => void;
  className?: string;
  disabled?: boolean;
};

export function PlannerDistanceInput({
  value,
  discipline,
  disciplineSettings,
  onChange,
  className,
  disabled,
}: PlannerDistanceInputProps) {
  const field = useEditableDistance(value, discipline, disciplineSettings, onChange);
  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      disabled={disabled}
      {...field}
    />
  );
}

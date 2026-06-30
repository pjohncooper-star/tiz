"use client";

import { useEffect, useState } from "react";
import {
  formatGoalTimeInput,
  GOAL_TIME_PLACEHOLDER,
  parseGoalTimeInput,
} from "@/lib/plan/goal-time";
import { Input, Label } from "@/components/ui";

type GoalTimeInputProps = {
  value: number | null | undefined;
  onChange: (minutes: number | null) => void;
  label?: string;
  compact?: boolean;
  className?: string;
};

const COMPACT_FIELD =
  "box-border w-full min-w-0 max-w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs leading-tight text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const COMPACT_LABEL = "mb-0.5 block text-[10px] font-medium leading-none text-zinc-500";

export function GoalTimeInput({
  value,
  onChange,
  label = "Goal time",
  compact = false,
  className,
}: GoalTimeInputProps) {
  const [text, setText] = useState(() => formatGoalTimeInput(value));

  useEffect(() => {
    setText(formatGoalTimeInput(value));
  }, [value]);

  function handleTextChange(nextText: string) {
    setText(nextText);
    if (!nextText.trim()) {
      onChange(null);
      return;
    }
    const minutes = parseGoalTimeInput(nextText);
    if (minutes != null) onChange(minutes);
  }

  function commit(nextText: string) {
    const trimmed = nextText.trim();
    if (!trimmed) {
      onChange(null);
      setText("");
      return;
    }
    const minutes = parseGoalTimeInput(trimmed);
    if (minutes == null) {
      setText(formatGoalTimeInput(value));
      return;
    }
    onChange(minutes);
    setText(formatGoalTimeInput(minutes));
  }

  const field = (
    <input
      type="text"
      className={compact ? COMPACT_FIELD : className}
      value={text}
      onChange={(e) => handleTextChange(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(text);
        }
      }}
      placeholder={GOAL_TIME_PLACEHOLDER}
    />
  );

  if (compact) {
    return (
      <div>
        <span className={COMPACT_LABEL}>{label}</span>
        {field}
      </div>
    );
  }

  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          }
        }}
        placeholder={GOAL_TIME_PLACEHOLDER}
      />
    </div>
  );
}

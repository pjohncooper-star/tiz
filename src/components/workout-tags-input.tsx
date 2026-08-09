"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input, Label } from "@/components/ui";
import {
  normalizeWorkoutTag,
  WORKOUT_TAG_MAX_COUNT,
  WORKOUT_TAG_MAX_LENGTH,
} from "@/lib/plan/workout-tags";

type Suggestion = { name: string; label: string };

type WorkoutTagsInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
};

export function WorkoutTagsInput({
  value,
  onChange,
  label = "Tags",
}: WorkoutTagsInputProps) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existing = new Set(value.map((t) => t.toLowerCase()));

  useEffect(() => {
    const q = draft.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/plan/tags?q=${encodeURIComponent(q)}&limit=8`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { tags?: Suggestion[] };
          const next = (data.tags ?? []).filter((t) => !existing.has(t.name));
          setSuggestions(next);
          setHighlight(0);
        })
        .catch(() => {
          /* ignore abort / network */
        });
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, value]);

  function addTag(raw: string) {
    const tag = normalizeWorkoutTag(raw);
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.name)) {
      setDraft("");
      setSuggestions([]);
      return;
    }
    if (value.length >= WORKOUT_TAG_MAX_COUNT) return;
    onChange([...value, tag.label]);
    setDraft("");
    setSuggestions([]);
    setOpen(false);
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && suggestions[highlight]) {
        addTag(suggestions[highlight]!.label);
        return;
      }
      addTag(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {tag}
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(index)}
            >
              ×
            </button>
          </span>
        ))}
        <div className="relative min-w-[8rem] flex-1">
          <Input
            className="border-0 px-1 py-0.5 shadow-none focus-visible:ring-0"
            value={draft}
            maxLength={WORKOUT_TAG_MAX_LENGTH}
            placeholder={value.length === 0 ? "Add tag…" : "Add another…"}
            aria-label="Add tag"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open && suggestions.length > 0}
            role="combobox"
            onChange={(e) => {
              setDraft(e.target.value.replace(/,/g, ""));
              setOpen(true);
            }}
            onFocus={() => {
              if (blurTimer.current) clearTimeout(blurTimer.current);
              setOpen(true);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={onKeyDown}
            disabled={value.length >= WORKOUT_TAG_MAX_COUNT}
          />
          {open && suggestions.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-auto rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-900"
            >
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.name} role="option" aria-selected={index === highlight}>
                  <button
                    type="button"
                    className={`block w-full px-3 py-1.5 text-left ${
                      index === highlight
                        ? "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                        : "text-zinc-800 dark:text-zinc-100"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(suggestion.label)}
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Press Enter or comma to add. Suggestions come from tags you’ve used before.
      </p>
    </div>
  );
}

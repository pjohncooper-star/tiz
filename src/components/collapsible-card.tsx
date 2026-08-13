"use client";

import { useState, type ReactNode } from "react";

export function CollapsibleCard({
  title,
  showLabel,
  hideLabel,
  defaultOpen = false,
  children,
}: {
  title: string;
  showLabel: string;
  hideLabel: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="text-xs text-sky-600 hover:underline"
        >
          {open ? hideLabel : showLabel}
        </button>
      </div>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

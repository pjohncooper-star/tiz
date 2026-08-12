"use client";

import Link from "next/link";

/** @deprecated Thin redirect card — full UI lives on /plan/training-plans. */
export function TrainingPlanCsvSettings() {
  return (
    <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
      <p>
        Manage CSV import, library editing, and apply from the Training plans page.
      </p>
      <Link
        href="/plan/training-plans"
        className="inline-block font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400"
      >
        Open training plans →
      </Link>
    </div>
  );
}

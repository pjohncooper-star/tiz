"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { libraryHref, trainingPlansHref } from "@/lib/plan/library-href";

function tabClass(active: boolean): string {
  return `-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
    active
      ? "border-sky-600 text-sky-800 dark:border-sky-400 dark:text-sky-100"
      : "border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
  }`;
}

export function LibraryTabs() {
  const pathname = usePathname();
  const plansActive =
    pathname === trainingPlansHref() || pathname.startsWith(`${trainingPlansHref()}/`);

  return (
    <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800" aria-label="Library sections">
      <Link href={libraryHref()} className={tabClass(!plansActive)}>
        Workouts
      </Link>
      <Link href={trainingPlansHref()} className={tabClass(plansActive)}>
        Training Plans
      </Link>
    </nav>
  );
}

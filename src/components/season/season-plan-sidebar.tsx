"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SETTINGS_SECTIONS } from "@/components/season/season-settings-types";

type SeasonPlanSidebarProps = {
  seasonName?: string;
  seasonStatus?: string;
};

export function SeasonPlanSidebar({ seasonName, seasonStatus }: SeasonPlanSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const seasonId = searchParams.get("seasonId");
  const query = seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : "";

  const navItems = [
    { href: `/plan${query}`, label: "Season dashboard", match: (p: string) => p === "/plan" },
    ...SETTINGS_SECTIONS.map((s) => ({
      href: `/plan/settings/${s.slug}${query}`,
      label: s.label,
      match: (p: string) => p === `/plan/settings/${s.slug}`,
    })),
  ];

  return (
    <aside className="w-52 shrink-0 border-r border-zinc-200 pr-4 dark:border-zinc-800">
      {seasonName && (
        <div className="mb-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{seasonName}</p>
          {seasonStatus && (
            <p className="text-xs capitalize text-zinc-500">{seasonStatus.toLowerCase()}</p>
          )}
        </div>
      )}
      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <Link
          href="/plan/seasons"
          className="block rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          All seasons
        </Link>
      </div>
    </aside>
  );
}

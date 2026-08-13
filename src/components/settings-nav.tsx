"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_CATEGORIES } from "@/lib/settings/categories";

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1.5">
      <Link
        href="/settings"
        className={linkClass(pathname === "/settings")}
      >
        All settings
      </Link>
      {SETTINGS_CATEGORIES.map((category) => (
        <Link
          key={category.href}
          href={category.href}
          className={linkClass(
            pathname === category.href || pathname.startsWith(`${category.href}/`)
          )}
        >
          {category.label}
        </Link>
      ))}
    </nav>
  );
}

function linkClass(active: boolean): string {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active
      ? "bg-sky-600 text-white"
      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
  }`;
}

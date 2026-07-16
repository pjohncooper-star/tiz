"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AppSidebarNav, type SidebarNavItem } from "@/components/app-sidebar-nav";
import { useCalendarBuildMode } from "@/components/calendar/calendar-build-mode";

const NAV_ICON: Record<string, string> = {
  Dashboard: "⌂",
  Calendar: "▦",
  Plan: "◫",
  "Workout Signaling": "◎",
  Settings: "⚙",
};

type AppSidebarClientProps = {
  items: SidebarNavItem[];
  footer?: ReactNode;
};

export function AppSidebarClient({ items, footer }: AppSidebarClientProps) {
  const { active: buildMode } = useCalendarBuildMode();
  const collapsed = buildMode;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${
        collapsed ? "w-12" : "w-48"
      }`}
    >
      <div
        className={`border-b border-zinc-200 dark:border-zinc-800 ${
          collapsed ? "px-2 py-3 text-center" : "px-4 py-4"
        }`}
      >
        <Link
          href="/dashboard"
          className={`font-semibold text-zinc-900 dark:text-zinc-100 ${
            collapsed ? "text-sm" : "text-lg"
          }`}
          title="TiZ"
        >
          {collapsed ? "T" : "TiZ"}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {collapsed ? (
          <nav className="flex flex-col items-center gap-1 px-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="flex h-9 w-9 items-center justify-center rounded-md text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                {NAV_ICON[item.label] ?? item.label.charAt(0)}
              </Link>
            ))}
          </nav>
        ) : (
          <AppSidebarNav items={items} />
        )}
      </div>

      {!collapsed && footer ? (
        <div className="border-t border-zinc-200 dark:border-zinc-800">{footer}</div>
      ) : null}
    </aside>
  );
}

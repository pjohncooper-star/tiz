"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
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

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

function SidebarBrand({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className={`font-semibold text-zinc-900 dark:text-zinc-100 ${
        collapsed ? "text-sm" : "text-lg"
      }`}
      title="TiZ"
    >
      {collapsed ? "T" : "TiZ"}
    </Link>
  );
}

function SidebarPanel({
  items,
  footer,
  collapsed,
  onNavigate,
}: {
  items: SidebarNavItem[];
  footer?: ReactNode;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div
        className={`border-b border-zinc-200 dark:border-zinc-800 ${
          collapsed ? "px-2 py-3 text-center" : "px-4 py-4"
        }`}
      >
        <SidebarBrand collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {collapsed ? (
          <nav className="flex flex-col items-center gap-1 px-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={onNavigate}
                className="flex h-9 w-9 items-center justify-center rounded-md text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                {NAV_ICON[item.label] ?? item.label.charAt(0)}
              </Link>
            ))}
          </nav>
        ) : (
          <AppSidebarNav items={items} onNavigate={onNavigate} />
        )}
      </div>

      {!collapsed && footer ? (
        <div className="border-t border-zinc-200 dark:border-zinc-800">{footer}</div>
      ) : null}
    </>
  );
}

export function AppSidebarClient({ items, footer }: AppSidebarClientProps) {
  const { active: buildMode } = useCalendarBuildMode();
  const collapsed = buildMode;
  const [mobileOpen, setMobileOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-3 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls={panelId}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <MenuIcon open={mobileOpen} />
        </button>
        <SidebarBrand />
      </header>

      <div
        className={`fixed inset-0 z-50 md:hidden ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          tabIndex={mobileOpen ? 0 : -1}
          aria-label="Close navigation"
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeMobile}
        />
        <aside
          id={panelId}
          role="dialog"
          aria-modal={mobileOpen}
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-lg transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarPanel items={items} footer={footer} onNavigate={closeMobile} />
        </aside>
      </div>

      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-zinc-200 bg-white md:flex dark:border-zinc-800 dark:bg-zinc-950 ${
          collapsed ? "w-12" : "w-48"
        }`}
      >
        <SidebarPanel items={items} footer={footer} collapsed={collapsed} />
      </aside>
    </>
  );
}

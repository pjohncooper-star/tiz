"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { AppSidebarNav, type SidebarNavItem } from "@/components/app-sidebar-nav";

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

function SidebarBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
      title="TiZ"
    >
      TiZ
    </Link>
  );
}

function SidebarPanel({
  items,
  footer,
  onNavigate,
}: {
  items: SidebarNavItem[];
  footer?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <SidebarBrand onNavigate={onNavigate} />
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <AppSidebarNav items={items} onNavigate={onNavigate} />
      </div>

      {footer ? (
        <div className="border-t border-zinc-200 dark:border-zinc-800">{footer}</div>
      ) : null}
    </>
  );
}

export function AppSidebarClient({ items, footer }: AppSidebarClientProps) {
  const [navOpen, setNavOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls={panelId}
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setNavOpen((open) => !open)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          <MenuIcon open={navOpen} />
        </button>
        <SidebarBrand />
      </header>

      <div
        className={`fixed inset-0 z-50 ${navOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!navOpen}
      >
        <button
          type="button"
          tabIndex={navOpen ? 0 : -1}
          aria-label="Close navigation"
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            navOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeNav}
        />
        <aside
          id={panelId}
          role="dialog"
          aria-modal={navOpen}
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-zinc-200 bg-white shadow-lg transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950 ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarPanel items={items} footer={footer} onNavigate={closeNav} />
        </aside>
      </div>
    </>
  );
}

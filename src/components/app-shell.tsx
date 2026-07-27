"use client";

import type { ReactNode } from "react";
import { useCalendarBuildMode } from "@/components/calendar/calendar-build-mode";

export function AppShell({ children }: { children: ReactNode }) {
  const { active: buildMode } = useCalendarBuildMode();

  return (
    <div
      className={`min-h-screen pt-12 md:pt-0 ${
        buildMode ? "md:pl-12" : "md:pl-48"
      }`}
    >
      {children}
    </div>
  );
}

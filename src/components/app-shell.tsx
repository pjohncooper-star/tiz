"use client";

import type { ReactNode } from "react";
import { useCalendarBuildMode } from "@/components/calendar/calendar-build-mode";

export function AppShell({ children }: { children: ReactNode }) {
  const { active: buildMode } = useCalendarBuildMode();

  return (
    <div className={buildMode ? "min-h-screen pl-12" : "min-h-screen pl-48"}>
      {children}
    </div>
  );
}

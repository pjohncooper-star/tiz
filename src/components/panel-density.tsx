"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Input, Label, Select } from "@/components/ui";

export const PanelDensityContext = createContext(false);

export function usePanelDensity(): boolean {
  return useContext(PanelDensityContext);
}

export function PanelDensityProvider({
  dense,
  children,
}: {
  dense: boolean;
  children: ReactNode;
}) {
  return (
    <PanelDensityContext.Provider value={dense}>{children}</PanelDensityContext.Provider>
  );
}

export function PanelLabel({ children }: { children: ReactNode }) {
  const dense = usePanelDensity();
  if (dense) {
    return (
      <label className="mb-0.5 block text-[10px] font-medium leading-none text-zinc-500 dark:text-zinc-400">
        {children}
      </label>
    );
  }
  return <Label>{children}</Label>;
}

const DENSE_FIELD = "px-1.5 py-0.5 text-xs leading-tight";

export function PanelInput({
  className = "",
  ...props
}: React.ComponentProps<typeof Input>) {
  const dense = usePanelDensity();
  return <Input className={`${dense ? DENSE_FIELD : ""} ${className}`.trim()} {...props} />;
}

export function PanelSelect({
  className = "",
  ...props
}: React.ComponentProps<typeof Select>) {
  const dense = usePanelDensity();
  return <Select className={`${dense ? DENSE_FIELD : ""} ${className}`.trim()} {...props} />;
}

export function panelButtonClass(dense: boolean): string {
  return dense ? "px-2 py-0.5 text-xs" : "";
}

export function panelHeaderClass(dense: boolean): string {
  return dense
    ? "text-[10px] font-medium uppercase tracking-wide"
    : "text-xs font-medium uppercase tracking-wide";
}

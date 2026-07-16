"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type CalendarBuildModeContextValue = {
  active: boolean;
  setActive: (active: boolean) => void;
};

const CalendarBuildModeContext = createContext<CalendarBuildModeContextValue | null>(
  null
);

export function CalendarBuildModeProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState(false);
  const setActive = useCallback((next: boolean) => {
    setActiveState(next);
  }, []);

  const value = useMemo(() => ({ active, setActive }), [active, setActive]);

  return (
    <CalendarBuildModeContext.Provider value={value}>
      {children}
    </CalendarBuildModeContext.Provider>
  );
}

export function useCalendarBuildMode(): CalendarBuildModeContextValue {
  const ctx = useContext(CalendarBuildModeContext);
  if (!ctx) {
    return {
      active: false,
      setActive: () => {},
    };
  }
  return ctx;
}

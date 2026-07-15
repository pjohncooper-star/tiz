"use client";

import { useEffect, useState, type CSSProperties } from "react";

export type RechartsTooltipStyles = {
  contentStyle: CSSProperties;
  itemStyle: CSSProperties;
  labelStyle: CSSProperties;
};

const LIGHT: RechartsTooltipStyles = {
  contentStyle: {
    fontSize: 12,
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e7",
    borderRadius: 8,
    color: "#18181b",
  },
  itemStyle: { color: "#18181b" },
  labelStyle: { color: "#52525b" },
};

const DARK: RechartsTooltipStyles = {
  contentStyle: {
    fontSize: 12,
    backgroundColor: "#18181b",
    border: "1px solid #3f3f46",
    borderRadius: 8,
    color: "#f4f4f5",
  },
  itemStyle: { color: "#f4f4f5" },
  labelStyle: { color: "#a1a1aa" },
};

/** Matches Tailwind `dark:` media behavior used across the app. */
export function useRechartsTooltipStyles(): RechartsTooltipStyles {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return dark ? DARK : LIGHT;
}

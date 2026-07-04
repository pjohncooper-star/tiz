"use client";

import { useCallback, useState } from "react";

export type HoverTooltipState = {
  text: string;
  x: number;
  y: number;
};

export function ChartHoverTooltipLayer({ tooltip }: { tooltip: HoverTooltipState | null }) {
  if (!tooltip) return null;

  return (
    <div
      className="pointer-events-none fixed z-[100] max-w-xs -translate-x-1/2 -translate-y-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      style={{ left: tooltip.x, top: tooltip.y - 8 }}
    >
      {tooltip.text}
    </div>
  );
}

export function useChartHoverTooltip() {
  const [tooltip, setTooltip] = useState<HoverTooltipState | null>(null);

  const show = useCallback((text: string, event: React.MouseEvent) => {
    setTooltip({ text, x: event.clientX, y: event.clientY });
  }, []);

  const move = useCallback((text: string, event: React.MouseEvent) => {
    setTooltip({ text, x: event.clientX, y: event.clientY });
  }, []);

  const hide = useCallback(() => setTooltip(null), []);

  const handlers = useCallback(
    (text: string) => ({
      onMouseEnter: (event: React.MouseEvent) => show(text, event),
      onMouseMove: (event: React.MouseEvent) => move(text, event),
      onMouseLeave: hide,
    }),
    [hide, move, show]
  );

  return { tooltip, handlers, hide };
}

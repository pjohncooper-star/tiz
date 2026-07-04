"use client";

import type { PreviewRaceMarker } from "@/lib/plan/season/preview-race-markers";
import {
  ChartHoverTooltipLayer,
  useChartHoverTooltip,
} from "@/components/season/chart-hover-tooltip";

const RACE_PRIORITY_STYLES: Record<"A" | "B" | "C", string> = {
  A: "bg-amber-500 text-white ring-amber-600/80",
  B: "bg-sky-500 text-white ring-sky-600/80",
  C: "bg-zinc-400 text-white ring-zinc-500/80 dark:bg-zinc-500",
};

type RaceMarkerOverlayProps = {
  markers: PreviewRaceMarker[];
};

export function RaceMarkerOverlay({ markers }: RaceMarkerOverlayProps) {
  const { tooltip, handlers } = useChartHoverTooltip();

  if (markers.length === 0) return null;

  return (
    <>
      <div className="relative h-5">
        {markers.map((race) => (
          <span
            key={race.key}
            className={`absolute top-0 z-20 flex h-5 w-5 -translate-x-1/2 cursor-default items-center justify-center rounded-full text-[10px] font-bold ring-1 ${RACE_PRIORITY_STYLES[race.priority]}`}
            style={{ left: `${race.positionFraction * 100}%` }}
            {...handlers(race.tooltip)}
          >
            {race.priority}
          </span>
        ))}
      </div>
      <ChartHoverTooltipLayer tooltip={tooltip} />
    </>
  );
}

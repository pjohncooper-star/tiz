"use client";

import type { CalendarWorkoutProfile } from "@/lib/plan/calendar/serialize";

type WorkoutProfileMiniChartProps = {
  profile: CalendarWorkoutProfile;
  className?: string;
};

const HEIGHT = 28;

export function WorkoutProfileMiniChart({ profile, className = "" }: WorkoutProfileMiniChartProps) {
  if (profile.segments.length === 0) return null;

  const width = 200;
  const { totalX, yMin, yMax } = profile;
  const plotBottom = HEIGHT;

  function xToPx(x: number): number {
    return (x / totalX) * width;
  }

  function yToPx(y: number): number {
    const t = (y - yMin) / (yMax - yMin || 1);
    return HEIGHT - t * HEIGHT;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      className={`mt-1 block h-7 w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {profile.segments.map((seg) => {
        const x = xToPx(seg.x);
        const w = Math.max(xToPx(seg.x + seg.width) - x, 0.5);
        const yTop = yToPx(seg.yHigh);
        const isRange = Math.abs(seg.yHigh - seg.yLow) > 1e-9;
        const yBottom = isRange ? yToPx(seg.yLow) : plotBottom;
        const barHeight = Math.max(yBottom - yTop, 0.5);
        return (
          <rect
            key={`${seg.x}-${seg.width}-${seg.yHigh}`}
            x={x}
            y={yTop}
            width={w}
            height={barHeight}
            fill={seg.fill}
            opacity={0.92}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

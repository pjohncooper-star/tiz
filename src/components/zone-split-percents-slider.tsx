"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zoneDotClass } from "@/components/simple-planner/zone-pill";
import {
  boundaryFromPointerRatio,
  boundariesFromPercents,
  percentsFromBoundaries,
  zonePercentsArray,
  type ZoneBoundaries,
} from "@/lib/plan/season/zone-split-boundaries";
import type { ZoneSplitPercents } from "@/lib/plan/season/zone-split-types";

const ZONES = [1, 2, 3, 4, 5] as const;

const HANDLE_LABELS = [
  "Boundary between Z1 and Z2",
  "Boundary between Z2 and Z3",
  "Boundary between Z3 and Z4",
  "Boundary between Z4 and Z5",
] as const;

type ZoneSplitPercentsSliderProps = {
  value: ZoneSplitPercents;
  onChange: (value: ZoneSplitPercents) => void;
  disabled?: boolean;
  minZonePercent?: number;
  className?: string;
};

export function ZoneSplitPercentsSlider({
  value,
  onChange,
  disabled = false,
  minZonePercent = 1,
  className = "",
}: ZoneSplitPercentsSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [draggingHandle, setDraggingHandle] = useState<number | null>(null);
  const boundaries = boundariesFromPercents(value);
  const percents = zonePercentsArray(value);

  const applyBoundaries = useCallback(
    (next: ZoneBoundaries) => {
      onChange(percentsFromBoundaries(next));
    },
    [onChange]
  );

  const pointerRatio = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return (clientX - rect.left) / rect.width;
  }, []);

  useEffect(() => {
    if (draggingHandle === null || disabled) return;
    const activeHandle = draggingHandle;

    function onPointerMove(event: PointerEvent) {
      const current = boundariesFromPercents(valueRef.current);
      const next = boundaryFromPointerRatio(
        pointerRatio(event.clientX),
        activeHandle,
        current,
        minZonePercent
      );
      applyBoundaries(next);
    }

    function onPointerEnd() {
      setDraggingHandle(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [applyBoundaries, disabled, draggingHandle, minZonePercent, pointerRatio]);

  function nudgeHandle(handleIndex: number, delta: number) {
    const next = boundaryFromPointerRatio(
      (boundaries[handleIndex]! + delta) / 100,
      handleIndex,
      boundaries,
      minZonePercent
    );
    applyBoundaries(next);
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="grid grid-cols-5 gap-1 text-center text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">
        {ZONES.map((zone, index) => (
          <div key={zone}>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Z{zone}</span>
            <div>{Math.round(percents[index]!)}%</div>
          </div>
        ))}
      </div>

      <div
        ref={trackRef}
        className={`relative h-8 select-none rounded-md ${disabled ? "opacity-50" : ""}`}
      >
        <div className="flex h-full overflow-hidden rounded-md">
          {ZONES.map((zone, index) => {
            const width = percents[index]!;
            if (width <= 0) return null;
            return (
              <div
                key={zone}
                className={`flex min-w-0 items-center justify-center text-[10px] font-semibold text-white/90 ${zoneDotClass(zone)}`}
                style={{ flex: Math.max(width, 0.1) }}
                title={`Z${zone}: ${Math.round(width)}%`}
              >
                {width >= 8 ? `Z${zone}` : ""}
              </div>
            );
          })}
        </div>

        {!disabled
          ? boundaries.map((boundary, handleIndex) => (
              <button
                key={`boundary-${handleIndex}`}
                type="button"
                role="slider"
                aria-label={HANDLE_LABELS[handleIndex]}
                aria-valuemin={minZonePercent * (handleIndex + 1)}
                aria-valuemax={100 - minZonePercent * (4 - handleIndex)}
                aria-valuenow={Math.round(boundary)}
                aria-valuetext={`${Math.round(boundary)}%`}
                className={`absolute top-0 z-10 h-8 w-3 -translate-x-1/2 touch-none rounded-sm border border-white/80 bg-white/30 shadow-sm backdrop-blur-sm transition hover:bg-white/50 dark:border-zinc-900/80 ${
                  draggingHandle === handleIndex ? "bg-white/60" : ""
                }`}
                style={{
                  left: `${boundary}%`,
                  cursor: "col-resize",
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDraggingHandle(handleIndex);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    nudgeHandle(handleIndex, -1);
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    nudgeHandle(handleIndex, 1);
                  }
                }}
              />
            ))
          : null}
      </div>
    </div>
  );
}

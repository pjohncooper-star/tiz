import type { PoolSize } from "@/lib/units/discipline-settings";
import { swimDisplayUnit } from "@/lib/units/discipline-settings";

const POOL_SIZE_ORDER: PoolSize[] = ["SCY", "SCM", "LCM"];

type PoolSizeSliderProps = {
  value: PoolSize;
  onChange: (value: PoolSize) => void;
  disabled?: boolean;
  showUnitHint?: boolean;
  className?: string;
};

export function poolSizeSliderIndex(poolSize: PoolSize): number {
  return POOL_SIZE_ORDER.indexOf(poolSize);
}

export function poolSizeFromSliderIndex(index: number): PoolSize {
  return POOL_SIZE_ORDER[Math.min(2, Math.max(0, index))] ?? "SCM";
}

export function PoolSizeSlider({
  value,
  onChange,
  disabled = false,
  showUnitHint = true,
  className = "",
}: PoolSizeSliderProps) {
  const index = poolSizeSliderIndex(value);
  const unitLabel = swimDisplayUnit(value) === "IMPERIAL" ? "yd" : "m";

  return (
    <div
      className={`select-none ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-0.5 flex items-center justify-between gap-2">
        {POOL_SIZE_ORDER.map((option) => (
          <span
            key={option}
            className={`text-[9px] font-medium uppercase tracking-wide ${
              option === value
                ? "text-cyan-800 dark:text-cyan-200"
                : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            {option}
          </span>
        ))}
        {showUnitHint ? (
          <span className="text-[9px] tabular-nums text-zinc-400 dark:text-zinc-500">{unitLabel}</span>
        ) : null}
      </div>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={index}
        disabled={disabled}
        onChange={(e) => onChange(poolSizeFromSliderIndex(Number(e.target.value)))}
        className="h-1.5 w-full cursor-pointer accent-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Pool size"
        aria-valuetext={value}
      />
    </div>
  );
}

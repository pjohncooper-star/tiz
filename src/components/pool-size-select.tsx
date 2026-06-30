import { POOL_SIZE_OPTIONS, type PoolSize } from "@/lib/units/discipline-settings";

const COMPACT_FIELD =
  "box-border w-full min-w-0 max-w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs leading-tight text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

type PoolSizeSelectProps = {
  value: PoolSize;
  onChange: (value: PoolSize) => void;
  compact?: boolean;
  className?: string;
  label?: string;
  labelClassName?: string;
};

export function PoolSizeSelect({
  value,
  onChange,
  compact = false,
  className,
  label = "Pool",
  labelClassName,
}: PoolSizeSelectProps) {
  const fieldClass = compact ? COMPACT_FIELD : className;
  const labelClass =
    labelClassName ??
    (compact
      ? "mb-0.5 block text-[10px] font-medium leading-none text-zinc-500"
      : "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300");

  return (
    <div>
      {label ? <span className={labelClass}>{label}</span> : null}
      <select
        className={fieldClass}
        value={value}
        onChange={(e) => onChange(e.target.value as PoolSize)}
        aria-label="Pool size"
      >
        {POOL_SIZE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {compact ? option.value : option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

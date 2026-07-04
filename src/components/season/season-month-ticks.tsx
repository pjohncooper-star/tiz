type SeasonMonthTicksProps = {
  ticks: { weekIndex: number; label: string }[];
  displayWeeks: number;
};

export function SeasonMonthTicks({ ticks, displayWeeks }: SeasonMonthTicksProps) {
  if (ticks.length === 0) return null;

  return (
    <div className="relative h-4 border-t border-zinc-200 pt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:border-zinc-800">
      {ticks.map((tick) => (
        <span
          key={`${tick.label}-${tick.weekIndex}`}
          className="absolute top-1 whitespace-nowrap"
          style={{ left: `${(tick.weekIndex / displayWeeks) * 100}%` }}
        >
          {tick.label}
        </span>
      ))}
    </div>
  );
}

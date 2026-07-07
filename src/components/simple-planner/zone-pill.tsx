const ZONE_COLORS: Record<number, { pill: string; dot: string; input: string }> = {
  1: {
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    dot: "bg-sky-500",
    input: "placeholder:text-sky-400/70 dark:placeholder:text-sky-300/50",
  },
  2: {
    pill: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
    dot: "bg-green-500",
    input: "placeholder:text-green-400/70 dark:placeholder:text-green-300/50",
  },
  3: {
    pill: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
    dot: "bg-yellow-500",
    input: "placeholder:text-yellow-600/70 dark:placeholder:text-yellow-300/50",
  },
  4: {
    pill: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
    dot: "bg-orange-500",
    input: "placeholder:text-orange-400/70 dark:placeholder:text-orange-300/50",
  },
  5: {
    pill: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    dot: "bg-red-500",
    input: "placeholder:text-red-400/70 dark:placeholder:text-red-300/50",
  },
};

export function zonePillClass(zone: number): string {
  return ZONE_COLORS[zone]?.pill ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
}

export function zoneDotClass(zone: number): string {
  return ZONE_COLORS[zone]?.dot ?? "bg-zinc-400";
}

function zoneInputClass(zone: number): string {
  return ZONE_COLORS[zone]?.input ?? "";
}

const PILL_INPUT =
  "w-full min-w-0 border-0 bg-white/70 px-1.5 py-0.5 text-right text-sm font-medium text-inherit shadow-none ring-0 focus:outline-none focus:ring-1 focus:ring-current/30 dark:bg-black/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function ZoneLabel({ zone }: { zone: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold">
      <span className={`h-1.5 w-1.5 rounded-full ${zoneDotClass(zone)}`} />
      Z{zone}
    </span>
  );
}

type ZonePillInputProps = {
  zone: number;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number | string;
  inputWidth?: string;
};

/** Single zone pill with embedded minutes (or other) value. */
export function ZonePillInput({
  zone,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1,
  inputWidth = "w-12",
}: ZonePillInputProps) {
  return (
    <label
      className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-2 pr-1 ${zonePillClass(zone)}`}
    >
      <ZoneLabel zone={zone} />
      <span className={`inline-flex items-center gap-0.5 rounded-full bg-white/50 pr-1.5 dark:bg-black/20 ${inputWidth}`}>
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          className={`${PILL_INPUT} ${zoneInputClass(zone)}`}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <span className="pr-0.5 text-[10px] font-medium opacity-70">{suffix}</span> : null}
      </span>
    </label>
  );
}

type ZonePillFieldProps = {
  zone: number;
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number | string;
};

function ZonePillField({
  zone,
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1,
}: ZonePillFieldProps) {
  return (
    <label className="inline-flex min-w-0 flex-1 items-center gap-1 text-[10px] font-medium">
      <span className="shrink-0 opacity-70">{label}</span>
      <span className="inline-flex min-w-0 flex-1 items-center rounded-full bg-white/50 pr-1 dark:bg-black/20">
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          className={`${PILL_INPUT} ${zoneInputClass(zone)}`}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix ? <span className="shrink-0 pr-1 opacity-70">{suffix}</span> : null}
      </span>
    </label>
  );
}

type ZoneRampPillRowProps = {
  zone: number;
  startMinutes: number;
  peakMinutes: number;
  ratePercent: number;
  onStartChange: (value: number) => void;
  onPeakChange: (value: number) => void;
  onRateChange: (value: number) => void;
};

/** One zone-colored pill row with start, peak, and rate fields inside. */
export function ZoneRampPillRow({
  zone,
  startMinutes,
  peakMinutes,
  ratePercent,
  onStartChange,
  onPeakChange,
  onRateChange,
}: ZoneRampPillRowProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full px-3 py-1.5 sm:flex-nowrap ${zonePillClass(zone)}`}
    >
      <ZoneLabel zone={zone} />
      <ZonePillField zone={zone} label="Start" value={startMinutes} onChange={onStartChange} suffix="m" />
      <ZonePillField zone={zone} label="Peak" value={peakMinutes} onChange={onPeakChange} suffix="m" />
      <ZonePillField
        zone={zone}
        label="Rate"
        value={ratePercent}
        onChange={onRateChange}
        suffix="%"
        step="0.1"
        max={100}
      />
    </div>
  );
}

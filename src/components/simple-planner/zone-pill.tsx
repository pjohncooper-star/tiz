import { NumberEditorInput } from "@/components/number-editor-input";

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
  "min-w-[2.25rem] w-10 border-0 bg-transparent px-0.5 py-0 text-right text-sm font-semibold text-inherit shadow-none ring-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

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
};

/** Single zone pill with embedded minutes (or other) value inside the same oval. */
export function ZonePillInput({
  zone,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1,
}: ZonePillInputProps) {
  return (
    <label
      className={`inline-flex min-w-[5.75rem] items-center gap-1 rounded-full px-3 py-1 ${zonePillClass(zone)}`}
    >
      <ZoneLabel zone={zone} />
      <NumberEditorInput
        min={min}
        max={max}
        step={step}
        integer={step !== "0.1" && step !== 0.1}
        className={`${PILL_INPUT} ${zoneInputClass(zone)}`}
        value={value}
        onCommit={(v) => {
          if (v != null) onChange(v);
        }}
      />
      {suffix ? <span className="shrink-0 text-[10px] font-medium opacity-75">{suffix}</span> : null}
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
    <span className="inline-flex min-w-0 flex-1 items-center gap-1 border-l border-current/20 pl-3 text-[10px] font-medium first:border-l-0 first:pl-0">
      <span className="shrink-0 opacity-75">{label}</span>
      <NumberEditorInput
        min={min}
        max={max}
        step={step}
        integer={step !== "0.1" && step !== 0.1}
        className={`${PILL_INPUT} min-w-[2rem] flex-1 ${zoneInputClass(zone)}`}
        value={value}
        onCommit={(v) => {
          if (v != null) onChange(v);
        }}
      />
      {suffix ? <span className="shrink-0 opacity-75">{suffix}</span> : null}
    </span>
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

/** One wide zone-colored pill with start, peak, and rate fields inside the same oval. */
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
      className={`flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-full px-4 py-1.5 sm:flex-nowrap ${zonePillClass(zone)}`}
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

/** Calendar-style Today control: day-of-month in a date tile. */
export function CalendarTodayIcon({ day }: { day: number }) {
  return (
    <span
      className="relative inline-flex h-5 w-[1.15rem] flex-col items-center justify-start"
      aria-hidden
    >
      <svg
        viewBox="0 0 20 20"
        className="h-5 w-[1.15rem]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2.5" y="3.5" width="15" height="14" rx="2" />
        <path d="M2.5 7.5h15" />
        <path d="M6.5 2v3M13.5 2v3" />
      </svg>
      <span className="pointer-events-none absolute inset-x-0 top-[9px] text-center text-[9px] font-semibold leading-none tabular-nums">
        {day}
      </span>
    </span>
  );
}

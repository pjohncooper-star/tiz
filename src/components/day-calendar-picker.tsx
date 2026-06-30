"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";

const WEEK_OPTS = { weekStartsOn: 1 as const };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type ViewMode = "days" | "months" | "years";

type DayCalendarPickerProps = {
  selectedDate: string | null;
  onSelect: (date: string) => void;
  flaggableDates: string[];
  minDate: string | null;
  maxDate: string | null;
  /** Highlight every day in the week containing this date (Mon–Sun). */
  highlightWeekStart?: string | null;
};

function isInHighlightedWeek(day: Date, weekStart: string): boolean {
  const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
  const end = endOfWeek(start, WEEK_OPTS);
  return day >= start && day <= end;
}

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthInRange(year: number, monthIndex: number, minDate: string | null, maxDate: string | null) {
  const start = toDateKey(new Date(year, monthIndex, 1));
  const end = toDateKey(endOfMonth(new Date(year, monthIndex, 1)));
  if (maxDate && start > maxDate) return false;
  if (minDate && end < minDate) return false;
  return true;
}

function yearInRange(year: number, minDate: string | null, maxDate: string | null) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  if (maxDate && start > maxDate) return false;
  if (minDate && end < minDate) return false;
  return true;
}

export function DayCalendarPicker({
  selectedDate,
  onSelect,
  flaggableDates,
  minDate,
  maxDate,
  highlightWeekStart,
}: DayCalendarPickerProps) {
  const flaggable = useMemo(() => new Set(flaggableDates), [flaggableDates]);
  const flaggableMonths = useMemo(
    () => new Set(flaggableDates.map((d) => d.slice(0, 7))),
    [flaggableDates]
  );

  const selected = selectedDate ? parseISO(selectedDate) : null;
  const [viewMonth, setViewMonth] = useState(() =>
    selected ?? (maxDate ? parseISO(maxDate) : new Date())
  );
  const [viewMode, setViewMode] = useState<ViewMode>("days");
  const [yearPageStart, setYearPageStart] = useState(() => {
    const y = (selected ?? (maxDate ? parseISO(maxDate) : new Date())).getFullYear();
    return y - (y % 12);
  });

  useEffect(() => {
    if (selectedDate) {
      const d = parseISO(selectedDate);
      setViewMonth(d);
      setYearPageStart(d.getFullYear() - (d.getFullYear() % 12));
    }
  }, [selectedDate]);

  const minYear = minDate ? parseISO(minDate).getFullYear() : 1970;
  const maxYear = maxDate ? parseISO(maxDate).getFullYear() : 2100;

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, WEEK_OPTS);
  const gridEnd = endOfWeek(monthEnd, WEEK_OPTS);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function isDayDisabled(day: Date): boolean {
    const key = toDateKey(day);
    if (minDate && key < minDate) return true;
    if (maxDate && key > maxDate) return true;
    return false;
  }

  const viewYear = viewMonth.getFullYear();

  const canGoPrevDays =
    !minDate || startOfMonth(subMonths(viewMonth, 1)) >= startOfMonth(parseISO(minDate));
  const canGoNextDays =
    !maxDate || startOfMonth(addMonths(viewMonth, 1)) <= startOfMonth(parseISO(maxDate));

  const canGoPrevYear = yearInRange(viewYear - 1, minDate, maxDate);
  const canGoNextYear = yearInRange(viewYear + 1, minDate, maxDate);

  const canGoPrevYearPage = yearPageStart - 12 >= minYear;
  const canGoNextYearPage = yearPageStart + 12 <= maxYear;

  function goPrev() {
    if (viewMode === "days") setViewMonth((m) => subMonths(m, 1));
    else if (viewMode === "months") setViewMonth((m) => setYear(m, viewYear - 1));
    else setYearPageStart((y) => y - 12);
  }

  function goNext() {
    if (viewMode === "days") setViewMonth((m) => addMonths(m, 1));
    else if (viewMode === "months") setViewMonth((m) => setYear(m, viewYear + 1));
    else setYearPageStart((y) => y + 12);
  }

  const canGoPrev =
    viewMode === "days" ? canGoPrevDays : viewMode === "months" ? canGoPrevYear : canGoPrevYearPage;
  const canGoNext =
    viewMode === "days" ? canGoNextDays : viewMode === "months" ? canGoNextYear : canGoNextYearPage;

  function headerLabel() {
    if (viewMode === "days") return format(viewMonth, "MMMM yyyy");
    if (viewMode === "months") return format(viewMonth, "yyyy");
    return `${yearPageStart} – ${Math.min(yearPageStart + 11, maxYear)}`;
  }

  function onHeaderClick() {
    if (viewMode === "days") setViewMode("months");
    else if (viewMode === "months") setViewMode("years");
  }

  const yearsOnPage = Array.from({ length: 12 }, (_, i) => yearPageStart + i).filter(
    (y) => y >= minYear && y <= maxYear
  );

  return (
    <div className="w-full max-w-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Previous"
        >
          ←
        </button>
        {viewMode === "years" ? (
          <span className="text-sm font-medium">{headerLabel()}</span>
        ) : (
          <button
            type="button"
            onClick={onHeaderClick}
            className="rounded px-2 py-1 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title={viewMode === "days" ? "Pick month" : "Pick year"}
          >
            {headerLabel()}
          </button>
        )}
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Next"
        >
          →
        </button>
      </div>

      {viewMode === "days" && (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = toDateKey(day);
              const inMonth = isSameMonth(day, viewMonth);
              const disabled = isDayDisabled(day);
              const isSelected = selected ? isSameDay(day, selected) : false;
              const inWeek =
                highlightWeekStart && isInHighlightedWeek(day, highlightWeekStart);
              const hasFlaggable = flaggable.has(key);

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(key)}
                  className={`relative rounded-md py-2 text-sm ${
                    !inMonth
                      ? "text-zinc-300 dark:text-zinc-600"
                      : disabled
                        ? "text-zinc-300 dark:text-zinc-600"
                        : isSelected
                          ? "bg-sky-600 font-medium text-white"
                          : inWeek
                            ? "bg-sky-100 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                            : hasFlaggable
                              ? "font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                              : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  {format(day, "d")}
                  {hasFlaggable && !isSelected && inMonth && !disabled && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-500" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {viewMode === "months" && (
        <div className="grid grid-cols-3 gap-2">
          {MONTH_LABELS.map((label, monthIndex) => {
            const key = monthKey(viewYear, monthIndex);
            const enabled = monthInRange(viewYear, monthIndex, minDate, maxDate);
            const isCurrentMonth =
              selected?.getFullYear() === viewYear && selected.getMonth() === monthIndex;
            const hasFlaggable = flaggableMonths.has(key);

            return (
              <button
                key={key}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  setViewMonth(setMonth(setYear(viewMonth, viewYear), monthIndex));
                  setViewMode("days");
                }}
                className={`relative rounded-md px-2 py-3 text-sm ${
                  !enabled
                    ? "text-zinc-300 dark:text-zinc-600"
                    : isCurrentMonth
                      ? "bg-sky-600 font-medium text-white"
                      : hasFlaggable
                        ? "font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                }`}
              >
                {label}
                {hasFlaggable && !isCurrentMonth && enabled && (
                  <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewMode === "years" && (
        <div className="grid grid-cols-3 gap-2">
          {yearsOnPage.map((year) => {
            const enabled = yearInRange(year, minDate, maxDate);
            const isCurrentYear = selected?.getFullYear() === year;
            const hasFlaggable = flaggableDates.some((d) => d.startsWith(`${year}-`));

            return (
              <button
                key={year}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  setViewMonth(setYear(viewMonth, year));
                  setViewMode("months");
                }}
                className={`relative rounded-md px-2 py-3 text-sm ${
                  !enabled
                    ? "text-zinc-300 dark:text-zinc-600"
                    : isCurrentYear
                      ? "bg-sky-600 font-medium text-white"
                      : hasFlaggable
                        ? "font-medium text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                }`}
              >
                {year}
                {hasFlaggable && !isCurrentYear && enabled && (
                  <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewMode !== "days" && (
        <button
          type="button"
          onClick={() => setViewMode(viewMode === "years" ? "months" : "days")}
          className="mt-3 w-full rounded-md py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          {viewMode === "years" ? "Back to months" : "Back to days"}
        </button>
      )}
    </div>
  );
}

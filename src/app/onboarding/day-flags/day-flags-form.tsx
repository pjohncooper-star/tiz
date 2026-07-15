"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { DayCalendarPicker } from "@/components/day-calendar-picker";
import { Button, Card } from "@/components/ui";

const FLAGS = ["GREAT", "GOOD", "ROUGH", "BAD"] as const;
type FlagType = (typeof FLAGS)[number];

type FlagEntry = {
  flag: FlagType;
  startTime: string;
};

type Candidate = {
  id: string;
  name: string;
  startTime: string;
  discipline: string;
  isPrOrAchievement: boolean;
  dayQualityFlag: FlagType | null;
  deviceFeel: string | null;
  deviceRpe: number | null;
  fromDevice: boolean;
};

type SavedFlag = {
  activityId: string;
  dayQualityFlag: FlagType;
  startTime: string;
};

function mergeSavedFlags(
  prev: Record<string, FlagEntry>,
  saved: SavedFlag[],
  candidates: Candidate[]
): Record<string, FlagEntry> {
  const next = { ...prev };
  for (const item of saved) {
    if (!next[item.activityId]) {
      next[item.activityId] = { flag: item.dayQualityFlag, startTime: item.startTime };
    }
  }
  for (const c of candidates) {
    if (c.dayQualityFlag && !next[c.id]) {
      next[c.id] = { flag: c.dayQualityFlag, startTime: c.startTime };
    }
  }
  return next;
}

function summarizeFlaggedDays(flags: Record<string, FlagEntry>): Record<FlagType, number> {
  const daysByFlag: Record<FlagType, Set<string>> = {
    GREAT: new Set(),
    GOOD: new Set(),
    ROUGH: new Set(),
    BAD: new Set(),
  };

  for (const { flag, startTime } of Object.values(flags)) {
    daysByFlag[flag].add(format(new Date(startTime), "yyyy-MM-dd"));
  }

  return {
    GREAT: daysByFlag.GREAT.size,
    GOOD: daysByFlag.GOOD.size,
    ROUGH: daysByFlag.ROUGH.size,
    BAD: daysByFlag.BAD.size,
  };
}

function FlagSummary({ summary }: { summary: Record<FlagType, number> }) {
  const totalDays = FLAGS.reduce((sum, flag) => sum + summary[flag], 0);
  if (totalDays === 0) return null;

  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
      {FLAGS.map((flag) => (
        <li
          key={flag}
          className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800"
        >
          <span className="capitalize text-zinc-600 dark:text-zinc-400">{flag.toLowerCase()}</span>
          <span className="font-medium">
            {summary[flag]} {summary[flag] === 1 ? "day" : "days"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DayFlagsForm() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [unflaggedDates, setUnflaggedDates] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{ min: string | null; max: string | null }>({
    min: null,
    max: null,
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [totalUnflagged, setTotalUnflagged] = useState(0);
  const [flags, setFlags] = useState<Record<string, FlagEntry>>({});
  const [savedFlagIds, setSavedFlagIds] = useState<Set<string>>(new Set());
  const [pendingClears, setPendingClears] = useState<Set<string>>(new Set());
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const loadDay = useCallback(async (date?: string) => {
    setLoading(true);
    const url = date ? `/api/day-flags?date=${encodeURIComponent(date)}` : "/api/day-flags";
    const res = await fetch(url);
    const data = await res.json();
    const nextCandidates: Candidate[] = data.candidates ?? [];
    setCandidates(nextCandidates);
    setDates(data.dates ?? []);
    setUnflaggedDates(data.unflaggedDates ?? []);
    setDateRange(data.dateRange ?? { min: null, max: null });
    setSelectedDate(data.selectedDate ?? null);
    setTotalUnflagged(data.totalUnflagged ?? 0);
    setOnboardingComplete(data.onboardingComplete === true);
    if (data.savedFlags) {
      setSavedFlagIds(new Set(data.savedFlags.map((s: SavedFlag) => s.activityId)));
      setFlags((prev) => mergeSavedFlags(prev, data.savedFlags, nextCandidates));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  function toggleFlag(activityId: string, flag: FlagType, startTime: string) {
    setDirtyIds((prev) => new Set(prev).add(activityId));
    setFlags((prev) => {
      if (prev[activityId]?.flag === flag) {
        const next = { ...prev };
        delete next[activityId];
        if (savedFlagIds.has(activityId)) {
          setPendingClears((p) => new Set(p).add(activityId));
        }
        return next;
      }
      setPendingClears((p) => {
        const next = new Set(p);
        next.delete(activityId);
        return next;
      });
      return { ...prev, [activityId]: { flag, startTime } };
    });
  }
  function onDateChange(date: string) {
    setSelectedDate(date);
    loadDay(date);
  }

  async function saveFlags(finishOnboarding: boolean) {
    setSubmitting(true);
    setSubmitError("");
    try {
      const flagsToSave = [
        ...[...dirtyIds]
          .filter((id) => !pendingClears.has(id) && flags[id])
          .map((activityId) => ({
            activityId,
            dayQualityFlag: flags[activityId].flag,
          })),
        ...[...pendingClears].map((activityId) => ({
          activityId,
          dayQualityFlag: null,
        })),
      ];

      const res = await fetch("/api/day-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flags: flagsToSave,
          complete: finishOnboarding,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error ?? "Could not save day flags");
        return;
      }
      if (finishOnboarding) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setDirtyIds(new Set());
        setPendingClears(new Set());
        await loadDay(selectedDate ?? undefined);
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setSubmitError("Could not save day flags. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  async function complete() {
    await saveFlags(true);
  }

  const flaggedCount = Object.keys(flags).length;
  const flagSummary = summarizeFlaggedDays(flags);
  const flaggedDayCount = FLAGS.reduce((sum, flag) => sum + flagSummary[flag], 0);

  const dayLabel = selectedDate
    ? format(parseISO(selectedDate), "EEEE, MMM d, yyyy")
  : null;

  return (
    <div className="space-y-6">
      <Card title="Flag standout days">
        <p className="mb-3 text-sm text-zinc-500">
          Tag memorable days as great, good, rough, or bad. Workouts you rated on
          Garmin are pre-flagged from how they felt. Include rough days — contrast
          drives the insights above.
        </p>
        {totalUnflagged > 0 && (
          <p className="mb-3 text-xs text-zinc-500">
            {totalUnflagged} activities still unflagged · {dates.length} days with workouts
          </p>
        )}
        {flaggedDayCount > 0 && (
          <div className="mb-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <p className="text-sm font-medium">Your flagged days</p>
            <FlagSummary summary={flagSummary} />
          </div>
        )}
        {(dates.length > 0 || dateRange.min) && (
          <div className="mb-4 flex flex-wrap items-start gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500">Day</span>
              <DayCalendarPicker
                selectedDate={selectedDate}
                onSelect={onDateChange}
                flaggableDates={unflaggedDates}
                minDate={dateRange.min}
                maxDate={dateRange.max}
              />
            </div>
            {dayLabel && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {candidates.length} {candidates.length === 1 ? "activity" : "activities"} on{" "}
                {dayLabel}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading activities…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {dates.length === 0
              ? "No activities to flag yet. Import workouts first, or finish if you have already flagged everything."
              : "No activities on this day."}
          </p>
        ) : (
          <ul className="space-y-3">
            {candidates.map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="shrink-0 text-right text-zinc-500">
                    {format(new Date(c.startTime), "h:mm a")} · {c.discipline}
                    {c.isPrOrAchievement && " · PR"}
                  </span>
                </div>
                {c.fromDevice && (c.deviceFeel || c.deviceRpe != null) && (
                  <p className="mb-2 text-xs text-zinc-500">
                    Garmin rating
                    {c.deviceFeel ? `: felt ${c.deviceFeel.toLowerCase()}` : ""}
                    {c.deviceRpe != null ? ` · ${c.deviceRpe}/10 effort` : ""}
                    {c.dayQualityFlag
                      ? ` → flagged ${c.dayQualityFlag.toLowerCase()}`
                      : ""}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {FLAGS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleFlag(c.id, f, c.startTime)}
                      className={`rounded px-2 py-1 text-xs ${
                        flags[c.id]?.flag === f
                          ? "bg-sky-600 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800"
                      }`}
                    >
                      {f.toLowerCase()}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onboardingComplete ? (
            <>
              <Button
                type="button"
                onClick={() => void saveFlags(false)}
                disabled={submitting || (dirtyIds.size === 0 && pendingClears.size === 0)}
              >
                {submitting ? "Saving…" : "Save flags"}
              </Button>
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Back to dashboard
              </Link>
            </>
          ) : (
            <Button className="mt-4" onClick={() => setConfirmOpen(true)}>
              Finish onboarding
            </Button>
          )}
        </div>
      </Card>

      {!onboardingComplete && confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submitting && setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-onboarding-title"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="finish-onboarding-title" className="text-lg font-semibold">
              Finish onboarding?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Your flags will be saved and you&apos;ll go to the dashboard.
              {flaggedCount > 0
                ? ` You've flagged ${flaggedCount} ${flaggedCount === 1 ? "activity" : "activities"} across ${flaggedDayCount} ${flaggedDayCount === 1 ? "day" : "days"}.`
                : " You haven't flagged any activities yet — you can keep reviewing days before finishing."}
            </p>
            <FlagSummary summary={flagSummary} />
            {submitError && (
              <p className="mt-3 text-sm text-red-600">{submitError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                Keep flagging
              </Button>
              <Button type="button" onClick={complete} disabled={submitting}>
                {submitting ? "Finishing…" : "Finish onboarding"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

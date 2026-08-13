"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button, Input, Label, SegmentedControl, Select } from "@/components/ui";
import { trainingPlanHref, trainingPlansHref } from "@/lib/plan/library-href";
import { mondayWeekStartKey } from "@/lib/dates";
import type {
  SimpleGoalEvent,
  SimpleTrainingPlanAttachment,
  SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import type { ApplyWindowWithPausesResult } from "@/lib/plan/training-plan";

type LibraryPlanOption = {
  id: string;
  name: string;
  durationDays: number;
  sessionCount: number;
};

function weeksLabel(durationDays: number): string {
  const weeks = Math.max(1, Math.ceil(durationDays / 7));
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

function raceOptions(goalEvents: SimpleGoalEvent[]): SimpleGoalEvent[] {
  return goalEvents.filter((event) => event.id && event.date);
}

export function SimplePlannerTrainingPlanPane({
  attachment,
  plans,
  goalEvents,
  weeks,
  selectedWeekIndex,
  previewWindow,
  onChange,
}: {
  attachment: SimpleTrainingPlanAttachment | null;
  plans: LibraryPlanOption[];
  goalEvents: SimpleGoalEvent[];
  weeks: SimpleWeek[];
  selectedWeekIndex: number | null;
  previewWindow: ApplyWindowWithPausesResult | null;
  onChange: (next: SimpleTrainingPlanAttachment | null) => void;
}) {
  const races = useMemo(() => raceOptions(goalEvents), [goalEvents]);
  const selectedWeek = selectedWeekIndex != null ? weeks[selectedWeekIndex] : null;
  const selectedMonday = selectedWeek
    ? mondayWeekStartKey(selectedWeek.weekStartDate)
    : null;

  function attachPlan(planId: string) {
    const plan = plans.find((row) => row.id === planId);
    if (!plan) return;
    const bRace = races.find((event) => event.priority === "B");
    const aRace = races.find((event) => event.priority === "A");
    const linked = bRace ?? aRace ?? null;
    onChange({
      trainingPlanId: plan.id,
      trainingPlanName: plan.name,
      durationDays: plan.durationDays,
      sessionCount: plan.sessionCount,
      anchorMode: linked ? "end" : "start",
      anchorDate: linked?.date ?? weeks[0]?.weekStartDate ?? "",
      goalEventId: linked?.id ?? null,
      pausedWeeks: [],
      startDate: null,
      endDate: null,
    });
  }

  function pauseSelectedWeek() {
    if (!attachment || !selectedMonday) return;
    if (attachment.pausedWeeks.some((row) => row.weekStartDate === selectedMonday)) {
      return;
    }
    onChange({
      ...attachment,
      pausedWeeks: [
        ...attachment.pausedWeeks,
        { weekStartDate: selectedMonday, weekCount: 1 },
      ],
    });
  }

  function removePause(weekStartDate: string) {
    if (!attachment) return;
    onChange({
      ...attachment,
      pausedWeeks: attachment.pausedWeeks.filter(
        (row) => row.weekStartDate !== weekStartDate
      ),
    });
  }

  if (!attachment) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Attach a library training plan so its sessions count toward weekly hours, TiZ,
          and the workout pool. Pause known weeks (holiday, vacation, work trip) without
          editing the book.
        </p>
        {plans.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No training plans yet.{" "}
            <Link href={trainingPlansHref()} className="text-sky-600 hover:underline">
              Create one in the library
            </Link>
            .
          </p>
        ) : (
          <div>
            <Label>Training plan</Label>
            <Select
              value=""
              onChange={(event) => {
                if (event.target.value) attachPlan(event.target.value);
              }}
            >
              <option value="">Select a plan…</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({weeksLabel(plan.durationDays)}, {plan.sessionCount}{" "}
                  sessions)
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    );
  }

  const expandedDays = previewWindow?.appliedDurationDays ?? attachment.durationDays;
  const planWeeks = Math.max(1, Math.ceil(attachment.durationDays / 7));
  const attachedWeeks = Math.max(1, Math.ceil(expandedDays / 7));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {attachment.trainingPlanName}
          </p>
          <p className="text-xs text-zinc-500">
            {attachment.sessionCount} sessions · {weeksLabel(attachment.durationDays)}
            {attachedWeeks !== planWeeks
              ? ` → ${attachedWeeks} weeks attached`
              : null}
          </p>
          <Link
            href={trainingPlanHref(attachment.trainingPlanId)}
            className="text-xs text-sky-600 hover:underline"
          >
            Edit in library
          </Link>
        </div>
        <Button type="button" variant="secondary" onClick={() => onChange(null)}>
          Remove
        </Button>
      </div>

      <div>
        <Label>Anchor</Label>
        <SegmentedControl
          value={attachment.anchorMode}
          onChange={(anchorMode) => onChange({ ...attachment, anchorMode, goalEventId: null })}
          options={[
            { value: "start", label: "Start date" },
            { value: "end", label: "End date" },
          ]}
        />
      </div>

      {races.length > 0 ? (
        <div>
          <Label>End on race</Label>
          <Select
            value={attachment.goalEventId ?? ""}
            onChange={(event) => {
              const id = event.target.value || null;
              const race = races.find((row) => row.id === id);
              onChange({
                ...attachment,
                goalEventId: id,
                anchorMode: id ? "end" : attachment.anchorMode,
                anchorDate: race?.date ?? attachment.anchorDate,
              });
            }}
          >
            <option value="">Custom date</option>
            {races.map((race) => (
              <option key={race.id} value={race.id}>
                {race.priority} · {race.name} ({race.date})
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div>
        <Label>{attachment.anchorMode === "end" ? "End date" : "Start date"}</Label>
        <Input
          type="date"
          value={attachment.anchorDate}
          disabled={Boolean(attachment.goalEventId)}
          onChange={(event) =>
            onChange({ ...attachment, anchorDate: event.target.value, goalEventId: null })
          }
        />
      </div>

      {previewWindow ? (
        <p className="text-xs text-zinc-500">
          Lands {previewWindow.startDate} → {previewWindow.endDate}
          {previewWindow.truncated ? " (truncated to today)" : ""}.
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Pause weeks
            </p>
            <p className="text-xs text-zinc-500">
              Skip the plan for a holiday, vacation, or work trip. The book stays unchanged.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!selectedMonday}
            onClick={pauseSelectedWeek}
          >
            Pause selected week
          </Button>
        </div>
        {attachment.pausedWeeks.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Select a week on the timeline, then pause it.
          </p>
        ) : (
          <ul className="space-y-1">
            {attachment.pausedWeeks.map((pause) => (
              <li
                key={pause.weekStartDate}
                className="flex items-center justify-between rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700"
              >
                <span>
                  Week of {pause.weekStartDate}
                  {pause.weekCount > 1 ? ` · ${pause.weekCount} weeks` : ""}
                </span>
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-red-600"
                  onClick={() => removePause(pause.weekStartDate)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

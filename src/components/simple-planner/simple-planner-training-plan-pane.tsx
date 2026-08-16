"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Input, Label, SegmentedControl, Select } from "@/components/ui";
import { trainingPlanHref, trainingPlansHref } from "@/lib/plan/library-href";
import { addDaysToDateKey, mondayWeekStartKey } from "@/lib/dates";
import type {
  SimpleGoalEvent,
  SimpleTrainingPlanAttachment,
  SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import type { ApplyWindowWithPausesResult } from "@/lib/plan/training-plan";
import type { SeasonDateExtension } from "@/lib/plan/training-plan";
import {
  clashIsUnresolved,
  PROGRAM_DISCIPLINES,
  resolveClashPrefer,
  type PlanSessionClash,
  type PlanSessionConflict,
  type ProgramDiscipline,
} from "@/lib/plan/season/plan-session-conflicts";

type LibraryPlanOption = {
  id: string;
  name: string;
  durationDays: number;
  sessionCount: number;
};

const DISCIPLINE_LABEL: Record<ProgramDiscipline, string> = {
  SWIM: "Swim",
  BIKE: "Bike",
  RUN: "Run",
  STRENGTH: "Strength",
};

function weeksLabel(durationDays: number): string {
  const weeks = Math.max(1, Math.ceil(durationDays / 7));
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

function raceOptions(goalEvents: SimpleGoalEvent[]): SimpleGoalEvent[] {
  return goalEvents.filter((event) => event.id && event.date);
}

function formatWindow(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const fmt = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y!, m! - 1, d);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return `${fmt(start)}–${fmt(end)}`;
}

function newAttachmentId(): string {
  return crypto.randomUUID();
}

function suggestedProgramStartDate(input: {
  weeks: SimpleWeek[];
  selectedWeekIndex: number | null;
  attachments: SimpleTrainingPlanAttachment[];
  windowsByAttachmentId: Record<string, { window: { endDate: string } }>;
}): string {
  let latestEnd: string | null = null;
  for (const row of input.attachments) {
    const id = row.id ?? row.trainingPlanId;
    const end =
      input.windowsByAttachmentId[id]?.window.endDate ?? row.endDate;
    if (end && (!latestEnd || end > latestEnd)) latestEnd = end;
  }
  if (latestEnd) return addDaysToDateKey(latestEnd, 1);

  const selected =
    input.selectedWeekIndex != null
      ? input.weeks[input.selectedWeekIndex]?.weekStartDate
      : null;
  if (selected) return mondayWeekStartKey(selected);
  return input.weeks[0]?.weekStartDate ?? "";
}

function defaultAttachment(
  plan: LibraryPlanOption,
  startDate: string,
  owns: ProgramDiscipline[] | null
): SimpleTrainingPlanAttachment {
  return {
    id: newAttachmentId(),
    trainingPlanId: plan.id,
    trainingPlanName: plan.name,
    durationDays: plan.durationDays,
    sessionCount: plan.sessionCount,
    anchorMode: "start",
    anchorDate: startDate,
    goalEventId: null,
    pausedWeeks: [],
    startDate: null,
    endDate: null,
    ownsDisciplines: owns,
    fillLeftoverTiz: {},
  };
}

export function SimplePlannerTrainingPlanPane({
  attachments,
  plans,
  goalEvents,
  weeks,
  selectedWeekIndex,
  windowsByAttachmentId,
  clashes,
  conflicts,
  sessionsByPlanId,
  onChange,
  onConflictsChange,
  onPauseAllThisWeek,
  onExtendSeason,
  onRemove,
  busy = false,
}: {
  attachments: SimpleTrainingPlanAttachment[];
  plans: LibraryPlanOption[];
  goalEvents: SimpleGoalEvent[];
  weeks: SimpleWeek[];
  selectedWeekIndex: number | null;
  windowsByAttachmentId: Record<
    string,
    { window: ApplyWindowWithPausesResult; extension: SeasonDateExtension | null }
  >;
  clashes: PlanSessionClash[];
  conflicts: PlanSessionConflict[];
  sessionsByPlanId: Record<string, Array<{ discipline: string }>>;
  onChange: (next: SimpleTrainingPlanAttachment[]) => void;
  onConflictsChange: (next: PlanSessionConflict[]) => void;
  onPauseAllThisWeek: () => void;
  onExtendSeason: (extension: SeasonDateExtension) => void;
  onRemove: (index: number) => void;
  busy?: boolean;
}) {
  const races = useMemo(() => raceOptions(goalEvents), [goalEvents]);
  const [customAddDate, setCustomAddDate] = useState<string | null>(null);
  const suggestedAddDate = useMemo(
    () =>
      suggestedProgramStartDate({
        weeks,
        selectedWeekIndex,
        attachments,
        windowsByAttachmentId,
      }),
    [weeks, selectedWeekIndex, attachments, windowsByAttachmentId]
  );
  const addStartDate = customAddDate || suggestedAddDate;
  const selectedWeek = selectedWeekIndex != null ? weeks[selectedWeekIndex] : null;
  const selectedMonday = selectedWeek
    ? mondayWeekStartKey(selectedWeek.weekStartDate)
    : null;
  const unresolved = clashes.filter((clash) => clashIsUnresolved(clash, conflicts));
  const extensions = Object.values(windowsByAttachmentId)
    .map((row) => row.extension)
    .filter((row): row is SeasonDateExtension => Boolean(row));

  function mixForPlan(planId: string): ProgramDiscipline[] {
    const sessions = sessionsByPlanId[planId] ?? [];
    const set = new Set<ProgramDiscipline>();
    for (const session of sessions) {
      if (session.discipline === "SWIM" || session.discipline === "BIKE" || session.discipline === "RUN" || session.discipline === "STRENGTH") {
        set.add(session.discipline);
      }
    }
    return set.size > 0 ? [...set] : [...PROGRAM_DISCIPLINES];
  }

  function addPlan(planId: string) {
    const plan = plans.find((row) => row.id === planId);
    if (!plan || !addStartDate) return;
    onChange([
      ...attachments,
      defaultAttachment(plan, addStartDate, mixForPlan(plan.id)),
    ]);
    setCustomAddDate(null);
  }

  function updateAt(index: number, next: SimpleTrainingPlanAttachment) {
    onChange(attachments.map((row, i) => (i === index ? next : row)));
  }

  function removeAt(index: number) {
    onRemove(index);
  }

  function pauseSelected(attachment: SimpleTrainingPlanAttachment, index: number) {
    if (!selectedMonday) return;
    if (attachment.pausedWeeks.some((row) => row.weekStartDate === selectedMonday)) {
      return;
    }
    updateAt(index, {
      ...attachment,
      pausedWeeks: [
        ...attachment.pausedWeeks,
        { weekStartDate: selectedMonday, weekCount: 1 },
      ],
    });
  }

  const programPicker = (
    placeholder: string,
    options: LibraryPlanOption[]
  ) => (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[12rem] flex-1">
        <Label>Program</Label>
        <Select
          value=""
          onChange={(event) => {
            if (event.target.value) addPlan(event.target.value);
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} ({weeksLabel(plan.durationDays)}, {plan.sessionCount}{" "}
              sessions)
            </option>
          ))}
        </Select>
      </div>
      <div className="w-44">
        <Label>Start date</Label>
        <Input
          type="date"
          value={addStartDate}
          onChange={(event) => setCustomAddDate(event.target.value || null)}
        />
      </div>
    </div>
  );

  if (attachments.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Attach library programs so their sessions count toward weekly hours, TiZ,
          and the workout pool. Overlapping programs are allowed. Pause known weeks
          (holiday, vacation, work trip) without editing the program.
        </p>
        {plans.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No programs yet.{" "}
            <Link href={trainingPlansHref()} className="text-sky-600 hover:underline">
              Create one in the library
            </Link>
            .
          </p>
        ) : (
          <div>
            {programPicker("Select a program…", plans)}
            <p className="mt-1 text-xs text-zinc-500">
              The program starts on this date. Link it to a race afterward if you want
              an end-anchor.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unresolved.length > 0 ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <p className="font-medium text-amber-900 dark:text-amber-100">
            Same-day same-sport sessions overlap. Save is allowed — pick prefer one
            or keep both.
          </p>
          <ul className="space-y-2">
            {unresolved.map((clash) => (
              <li
                key={`${clash.dateKey}-${clash.discipline}-${clash.a.attachmentId}-${clash.b.attachmentId}`}
                className="space-y-1"
              >
                <p>
                  {clash.dateKey} · {DISCIPLINE_LABEL[clash.discipline]}:{" "}
                  {clash.a.attachmentName}
                  {clash.a.title ? ` (${clash.a.title})` : ""} vs{" "}
                  {clash.b.attachmentName}
                  {clash.b.title ? ` (${clash.b.title})` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      onConflictsChange(resolveClashPrefer(clash, "a", conflicts))
                    }
                  >
                    Prefer {clash.a.attachmentName}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      onConflictsChange(resolveClashPrefer(clash, "b", conflicts))
                    }
                  >
                    Prefer {clash.b.attachmentName}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      onConflictsChange(resolveClashPrefer(clash, "both", conflicts))
                    }
                  >
                    Keep both
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extensions.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <p>
            A program window falls outside this season. Extend the season dates to
            fit, or the extra days will not get week targets.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              const merged: SeasonDateExtension = {};
              for (const row of extensions) {
                if (row.startDate && (!merged.startDate || row.startDate < merged.startDate)) {
                  merged.startDate = row.startDate;
                }
                if (row.endDate && (!merged.endDate || row.endDate > merged.endDate)) {
                  merged.endDate = row.endDate;
                }
              }
              onExtendSeason(merged);
            }}
          >
            Extend season to fit
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!selectedMonday}
          onClick={onPauseAllThisWeek}
        >
          Pause all programs this week
        </Button>
        {plans.length > 0 ? (
          <div>
            {programPicker("Add program…", plans)}
            <p className="mt-1 text-xs text-zinc-500">
              Defaults to the day after the last attached program. Link to a race on
              the card if you want an end-anchor.
            </p>
          </div>
        ) : null}
      </div>

      {attachments.map((attachment, index) => {
        const attachmentId = attachment.id ?? attachment.trainingPlanId;
        const preview = windowsByAttachmentId[attachmentId];
        const windowLabel = formatWindow(
          preview?.window.startDate ?? attachment.startDate,
          preview?.window.endDate ?? attachment.endDate
        );
        const expandedDays = preview?.window.appliedDurationDays ?? attachment.durationDays;
        const planWeeks = Math.max(1, Math.ceil(attachment.durationDays / 7));
        const attachedWeeks = Math.max(1, Math.ceil(expandedDays / 7));
        const owns = attachment.ownsDisciplines ?? mixForPlan(attachment.trainingPlanId);
        const leftover = attachment.fillLeftoverTiz ?? {};

        return (
          <div
            key={attachmentId}
            className="space-y-3 rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {attachment.trainingPlanName}
                </p>
                <p className="text-xs text-zinc-500">
                  {windowLabel ?? `${attachment.sessionCount} sessions · ${weeksLabel(attachment.durationDays)}`}
                  {windowLabel
                    ? ` · ${attachment.sessionCount} sessions`
                    : null}
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
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => removeAt(index)}
              >
                Remove
              </Button>
            </div>

            <div>
              <Label>Anchor</Label>
              <SegmentedControl
                value={attachment.anchorMode}
                onChange={(anchorMode) =>
                  updateAt(index, { ...attachment, anchorMode, goalEventId: null })
                }
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
                    updateAt(index, {
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
                  updateAt(index, {
                    ...attachment,
                    anchorDate: event.target.value,
                    goalEventId: null,
                  })
                }
              />
            </div>

            {preview ? (
              <p className="text-xs text-zinc-500">
                Lands {preview.window.startDate} → {preview.window.endDate}
                {preview.window.truncated ? " (truncated to today)" : ""}.
              </p>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Owns hours / TiZ</legend>
              <p className="text-xs text-zinc-500">
                Uncheck a sport to keep season-ramp targets while still placing those
                sessions on the calendar. Targets and the calendar can then disagree.
              </p>
              <div className="flex flex-wrap gap-3">
                {PROGRAM_DISCIPLINES.map((discipline) => (
                  <label key={discipline} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={owns.includes(discipline)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...owns, discipline]
                          : owns.filter((row) => row !== discipline);
                        updateAt(index, { ...attachment, ownsDisciplines: next });
                      }}
                    />
                    {DISCIPLINE_LABEL[discipline]}
                  </label>
                ))}
              </div>
              {owns.length < mixForPlan(attachment.trainingPlanId).length ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Unowned sports still land on the calendar; hours and TiZ stay on the
                  season ramp.
                </p>
              ) : null}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Leftover TiZ</legend>
              <p className="text-xs text-zinc-500">
                Off for most programs: the program is the target. Turn on to fill leftover
                season minutes onto extra days.
              </p>
              <div className="flex flex-wrap gap-3">
                {owns.map((discipline) => (
                  <label key={discipline} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(leftover[discipline])}
                      onChange={(event) =>
                        updateAt(index, {
                          ...attachment,
                          fillLeftoverTiz: {
                            ...leftover,
                            [discipline]: event.target.checked,
                          },
                        })
                      }
                    />
                    Fill leftover {DISCIPLINE_LABEL[discipline]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Pause weeks
                  </p>
                  <p className="text-xs text-zinc-500">
                    Skip this program for a holiday, vacation, or work trip.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!selectedMonday}
                  onClick={() => pauseSelected(attachment, index)}
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
                        onClick={() =>
                          updateAt(index, {
                            ...attachment,
                            pausedWeeks: attachment.pausedWeeks.filter(
                              (row) => row.weekStartDate !== pause.weekStartDate
                            ),
                          })
                        }
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
      })}
    </div>
  );
}

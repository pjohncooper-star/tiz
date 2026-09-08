"use client";

import { useState } from "react";
import Link from "next/link";
import { FitnessFatigueChart } from "@/components/fitness-fatigue-chart";
import { SegmentedControl } from "@/components/ui";
import { SimplePlannerHeader } from "@/components/simple-planner/simple-planner-header";
import { SimplePlannerInspector } from "@/components/simple-planner/simple-planner-inspector";
import { SimplePlannerLoadTable } from "@/components/simple-planner/simple-planner-load-table";
import { SimplePlannerSaveBar } from "@/components/simple-planner/simple-planner-save-bar";
import { SimplePlannerTimeline } from "@/components/simple-planner/simple-planner-timeline";
import { SimplePlannerWeekTable } from "@/components/simple-planner/simple-planner-week-table";
import type { WeeklyTemplateOption } from "@/components/simple-planner/simple-planner-phases-pane";
import {
  type InspectorTarget,
  type SimpleSeason,
} from "@/components/simple-planner/simple-planner-types";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import type { AttachedPlanSessionDraft } from "@/lib/plan/season/preview-attached-plan";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import { mondayWeekStartKey } from "@/lib/dates";
import { shiftProgramAttachmentByWeeks } from "@/lib/plan/training-plan";

type CanvasMode = "weeks" | "load";

export function SimplePlannerWorkbench({
  season,
  onSeasonChange,
  target,
  onSelectTarget,
  templates,
  zoneFocusCatalog,
  disciplineSettings,
  libraryPlans,
  attachedPlanSessionsById,
  attachedPlanPreview,
  windowsByAttachmentId,
  seasons,
  trainerRoadCalendarSaved,
  trainerRoadBusy,
  onFollowTrainerRoad,
  onStopFollowingTrainerRoad,
  ecoLoadEnabled,
  dirty,
  saving,
  error,
  onSave,
  onDiscard,
  onRemoveProgram,
}: {
  season: SimpleSeason;
  onSeasonChange: (season: SimpleSeason) => void;
  target: InspectorTarget;
  onSelectTarget: (target: InspectorTarget) => void;
  templates: WeeklyTemplateOption[];
  zoneFocusCatalog: ZoneFocusCatalog;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  libraryPlans: Array<{ id: string; name: string; durationDays: number; sessionCount: number }>;
  attachedPlanSessionsById: Record<string, AttachedPlanSessionDraft[]>;
  attachedPlanPreview: ReturnType<
    typeof import("@/lib/plan/season/preview-attached-plan").previewAttachedPrograms
  >;
  windowsByAttachmentId: Record<
    string,
    {
      window: import("@/lib/plan/training-plan").ApplyWindowWithPausesResult;
      extension: import("@/lib/plan/training-plan").SeasonDateExtension | null;
    }
  >;
  seasons: Array<{ id: string; name: string }>;
  trainerRoadCalendarSaved: boolean;
  trainerRoadBusy: boolean;
  onFollowTrainerRoad: () => void;
  onStopFollowingTrainerRoad: () => void;
  ecoLoadEnabled: boolean;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onRemoveProgram: (index: number) => void;
}) {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("weeks");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const selectedWeekIndex = target.kind === "week" ? target.weekIndex : null;
  const selectedPhaseId = target.kind === "phase" ? target.phaseId : null;
  const maxHoursExceeded = Boolean(
    season.maxWeekHours &&
      attachedPlanPreview.weeks.some((week) => week.totalHours > (season.maxWeekHours ?? 0))
  );
  const seasonAttachments = season.trainingPlanAttachments?.length
    ? season.trainingPlanAttachments
    : season.trainingPlanAttachment
      ? [season.trainingPlanAttachment]
      : [];

  function selectWeek(weekIndex: number) {
    onSelectTarget({ kind: "week", weekIndex });
    setInspectorOpen(true);
  }

  function selectPhase(phaseId: string | null) {
    if (!phaseId) {
      onSelectTarget({ kind: "season" });
      return;
    }
    onSelectTarget({ kind: "phase", phaseId });
    setInspectorOpen(true);
  }

  return (
    <div className="space-y-4">
      <SimplePlannerHeader
        season={season}
        trainerRoadCalendarSaved={trainerRoadCalendarSaved}
        trainerRoadBusy={trainerRoadBusy}
        onFollowTrainerRoad={onFollowTrainerRoad}
        onStopFollowingTrainerRoad={onStopFollowingTrainerRoad}
        seasons={seasons}
        onSelectSeason={() => {
          onSelectTarget({ kind: "season" });
          setInspectorOpen(true);
        }}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)_22rem]">
        <aside className="hidden lg:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Seasons
          </p>
          <ul className="space-y-1">
            {seasons.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/plan?seasonId=${encodeURIComponent(item.id)}`}
                  className={`block rounded-md px-2 py-1.5 text-sm ${
                    item.id === season.id
                      ? "bg-sky-50 font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/plan?new=1"
            className="mt-3 inline-block text-xs text-sky-600 hover:underline"
          >
            + New season
          </Link>
        </aside>

        <div className="min-w-0 space-y-4">
          <SimplePlannerTimeline
            sticky
            seasonStart={season.startDate}
            weeks={attachedPlanPreview.weeks}
            phases={season.phases}
            goalEvents={season.goalEvents}
            primaryGoalEvent={season.primaryGoalEvent}
            selectedWeekIndex={selectedWeekIndex}
            onSelectWeek={selectWeek}
            onSelectPhase={(phaseId) => selectPhase(phaseId)}
            onSelectRace={(eventKey) => {
              onSelectTarget({ kind: "race", eventKey });
              setInspectorOpen(true);
            }}
            onSelectProgram={(attachmentId) => {
              onSelectTarget({ kind: "program", attachmentId });
              setInspectorOpen(true);
            }}
            planWindows={attachedPlanPreview.windows}
            attachments={seasonAttachments}
            onMoveProgram={(attachmentId, weekDelta) => {
              const windowStart = attachedPlanPreview.windows.find(
                (row) => row.attachmentId === attachmentId
              )?.window.startDate;
              if (!windowStart) return;
              const trainingPlanAttachments = seasonAttachments.map((row) =>
                (row.id ?? row.trainingPlanId) === attachmentId
                  ? shiftProgramAttachmentByWeeks(row, weekDelta, windowStart)
                  : row
              );
              onSeasonChange({
                ...season,
                trainingPlanAttachments,
                trainingPlanAttachment: trainingPlanAttachments[0] ?? null,
              });
            }}
            onPauseAllThisWeek={() => {
              const monday =
                selectedWeekIndex != null
                  ? mondayWeekStartKey(season.weeks[selectedWeekIndex]?.weekStartDate ?? "")
                  : null;
              if (!monday) return;
              onSeasonChange({
                ...season,
                trainingPlanAttachments: seasonAttachments.map((row) =>
                  row.pausedWeeks.some((pause) => pause.weekStartDate === monday)
                    ? row
                    : {
                        ...row,
                        pausedWeeks: [...row.pausedWeeks, { weekStartDate: monday, weekCount: 1 }],
                      }
                ),
              });
            }}
            previewHint={dirty ? "Unsaved preview" : null}
          />

          {maxHoursExceeded ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              One or more weeks exceed the max hours cap. Trim volume or raise the cap in Season
              advanced settings.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <SegmentedControl
              value={canvasMode}
              onChange={setCanvasMode}
              options={[
                { value: "weeks", label: "Weeks" },
                { value: "load", label: "Load" },
              ]}
            />
            <button
              type="button"
              className="text-xs text-sky-600 hover:underline lg:hidden"
              onClick={() => setInspectorOpen((open) => !open)}
            >
              {inspectorOpen ? "Hide inspector" : "Show inspector"}
            </button>
          </div>

          {canvasMode === "weeks" ? (
            <SimplePlannerWeekTable
              weeks={attachedPlanPreview.weeks}
              phases={season.phases}
              testWeekFlags={season.testWeekFlags ?? []}
              onTestWeekFlagsChange={(testWeekFlags) =>
                onSeasonChange({ ...season, testWeekFlags })
              }
              selectedPhaseId={selectedPhaseId}
              onSelectPhase={selectPhase}
              onSelectWeek={selectWeek}
              highlightedWeekIndex={selectedWeekIndex}
              phasesLocked={Boolean(season.trainerRoadDriven)}
              onWeeksChange={(nextWeeks) => {
                const nextByIndex = new Map(nextWeeks.map((week) => [week.weekIndex, week]));
                onSeasonChange({
                  ...season,
                  weeks: season.weeks.map((week) => {
                    const next = nextByIndex.get(week.weekIndex);
                    if (!next) return week;
                    return { ...week, isRestWeek: next.isRestWeek };
                  }),
                });
              }}
              onPhasesChange={(phases) => onSeasonChange({ ...season, phases })}
            />
          ) : (
            <SimplePlannerLoadTable season={season} onSeasonChange={onSeasonChange} />
          )}

          {ecoLoadEnabled ? (
            <details className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <summary className="cursor-pointer text-sm font-medium">
                Fitness / fatigue preview
              </summary>
              <div className="mt-3">
                <FitnessFatigueChart
                  seasonId={season.id}
                  draftWeeks={attachedPlanPreview.weeks.map((week) => ({
                    weekStartDate: week.weekStartDate,
                    zoneMinutes: week.zoneMinutes,
                    isRestWeek: week.isRestWeek,
                  }))}
                  compact
                />
              </div>
            </details>
          ) : null}
        </div>

        <aside
          className={`${
            inspectorOpen ? "block" : "hidden"
          } rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 lg:block ${
            inspectorOpen ? "fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto lg:static lg:max-h-none" : ""
          }`}
        >
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <p className="text-sm font-semibold">Inspector</p>
            <button type="button" className="text-xs text-zinc-500" onClick={() => setInspectorOpen(false)}>
              Close
            </button>
          </div>
          <button
            type="button"
            className="mb-3 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={() => onSelectTarget({ kind: "season" })}
          >
            Season
          </button>
          <SimplePlannerInspector
            season={season}
            target={target}
            onSeasonChange={onSeasonChange}
            onSelectTarget={(next) => {
              onSelectTarget(next);
              setInspectorOpen(true);
            }}
            templates={templates}
            zoneFocusCatalog={zoneFocusCatalog}
            disciplineSettings={disciplineSettings}
            libraryPlans={libraryPlans}
            attachedPlanSessionsById={attachedPlanSessionsById}
            windowsByAttachmentId={windowsByAttachmentId}
            clashes={attachedPlanPreview.clashes}
            selectedWeekIndex={selectedWeekIndex}
            onRemoveProgram={onRemoveProgram}
            onExtendSeason={(extension) =>
              onSeasonChange({
                ...season,
                startDate: extension.startDate ?? season.startDate,
                endDate: extension.endDate ?? season.endDate,
              })
            }
            busy={saving}
          />
        </aside>
      </div>

      <SimplePlannerSaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={onDiscard} />
    </div>
  );
}

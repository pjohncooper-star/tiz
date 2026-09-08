"use client";

import { useState } from "react";
import Link from "next/link";
import { Input, Label } from "@/components/ui";
import { NumberEditorInput } from "@/components/number-editor-input";
import {
  PhaseDetailEditor,
  MaterializePhasePanel,
  type PhaseEditorSection,
  type WeeklyTemplateOption,
} from "@/components/simple-planner/simple-planner-phases-pane";
import { RaceSection } from "@/components/simple-planner/simple-planner-races";
import { SeasonUnitsEditor } from "@/components/simple-planner/simple-planner-units";
import { SeasonWeekTemplatePicker } from "@/components/simple-planner/simple-planner-templates";
import { SimplePlannerTrainingPlanPane } from "@/components/simple-planner/simple-planner-training-plan-pane";
import { PhaseKindZoneDefaultsEditor } from "@/components/simple-planner/zone-split-editor";
import {
  createEmptyPhase,
  emptyRace,
  raceEventKey,
  type InspectorTarget,
  type SimplePhase,
  type SimpleSeason,
} from "@/components/simple-planner/simple-planner-types";
import { phaseGenerateBlockers } from "@/lib/plan/season/phase-generate-blockers";
import { isAssignedPhase, isEmptyPhase } from "@/lib/plan/season/phase-span-utils";
import { PLANNING_MODE_HELP, PLANNING_MODE_LABELS, PLANNING_MODES } from "@/lib/plan/season/planning-mode";
import type { PlanningMode } from "@prisma/client";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import type { AttachedPlanSessionDraft } from "@/lib/plan/season/preview-attached-plan";
import type { PlanSessionClash } from "@/lib/plan/season/plan-session-conflicts";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import { applySimpleSeasonDateBounds } from "@/lib/plan/season/simple-season-weeks";
import { zoneMinutesForDiscipline } from "@/lib/plan/season/simple-tiz";

const PHASE_TABS: { id: Exclude<PhaseEditorSection, "all">; label: string }[] = [
  { id: "shape", label: "Shape" },
  { id: "load", label: "Load" },
  { id: "intensity", label: "Intensity" },
  { id: "layout", label: "Layout" },
];

export function SimplePlannerInspector({
  season,
  target,
  onSeasonChange,
  onSelectTarget,
  templates,
  zoneFocusCatalog,
  disciplineSettings,
  libraryPlans,
  attachedPlanSessionsById,
  windowsByAttachmentId,
  clashes,
  selectedWeekIndex,
  onRemoveProgram,
  onExtendSeason,
  busy,
}: {
  season: SimpleSeason;
  target: InspectorTarget;
  onSeasonChange: (season: SimpleSeason) => void;
  onSelectTarget: (target: InspectorTarget) => void;
  templates: WeeklyTemplateOption[];
  zoneFocusCatalog: ZoneFocusCatalog;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  libraryPlans: Array<{ id: string; name: string; durationDays: number; sessionCount: number }>;
  attachedPlanSessionsById: Record<string, AttachedPlanSessionDraft[]>;
  windowsByAttachmentId: Record<
    string,
    {
      window: import("@/lib/plan/training-plan").ApplyWindowWithPausesResult;
      extension: import("@/lib/plan/training-plan").SeasonDateExtension | null;
    }
  >;
  clashes: PlanSessionClash[];
  selectedWeekIndex: number | null;
  onRemoveProgram: (index: number) => void;
  onExtendSeason: (extension: { startDate?: string; endDate?: string }) => void;
  busy: boolean;
}) {
  if (target.kind === "phase") {
    const phase =
      season.phases.find((item) => item.id === target.phaseId) ??
      season.phases.find((item) => item.name === target.phaseId) ??
      null;
    if (!phase) {
      return <p className="text-sm text-zinc-500">Select a phase on the timeline.</p>;
    }
    return (
      <PhaseInspector
        season={season}
        phase={phase}
        templates={templates}
        zoneFocusCatalog={zoneFocusCatalog}
        disciplineSettings={disciplineSettings}
        onSeasonChange={onSeasonChange}
      />
    );
  }
  if (target.kind === "week") {
    return (
      <WeekInspector
        season={season}
        weekIndex={target.weekIndex}
        onSeasonChange={onSeasonChange}
      />
    );
  }
  if (target.kind === "race") {
    return <RaceInspector season={season} eventKey={target.eventKey} onSeasonChange={onSeasonChange} />;
  }
  if (target.kind === "program") {
    return (
      <ProgramInspector
        season={season}
        libraryPlans={libraryPlans}
        attachedPlanSessionsById={attachedPlanSessionsById}
        windowsByAttachmentId={windowsByAttachmentId}
        clashes={clashes}
        selectedWeekIndex={selectedWeekIndex}
        onSeasonChange={onSeasonChange}
        onRemoveProgram={onRemoveProgram}
        onExtendSeason={onExtendSeason}
        busy={busy}
      />
    );
  }
  return (
    <SeasonInspector
      season={season}
      templates={templates}
      zoneFocusCatalog={zoneFocusCatalog}
      disciplineSettings={disciplineSettings}
      onSeasonChange={onSeasonChange}
      onSelectTarget={onSelectTarget}
    />
  );
}

function PhaseInspector({
  season,
  phase,
  templates,
  zoneFocusCatalog,
  disciplineSettings,
  onSeasonChange,
}: {
  season: SimpleSeason;
  phase: SimplePhase;
  templates: WeeklyTemplateOption[];
  zoneFocusCatalog: ZoneFocusCatalog;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onSeasonChange: (season: SimpleSeason) => void;
}) {
  const [tab, setTab] = useState<Exclude<PhaseEditorSection, "all">>("shape");
  const blockers = phaseGenerateBlockers(phase);

  function updatePhase(updated: SimplePhase) {
    onSeasonChange({
      ...season,
      phases: season.phases.map((item) =>
        (item.id ?? item.name) === (updated.id ?? updated.name) ? updated : item
      ),
    });
  }

  function deletePhase() {
    onSeasonChange({
      ...season,
      phases: season.phases.filter(
        (item) => (item.id ?? item.name) !== (phase.id ?? phase.name)
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{phase.name}</p>
        {blockers.length > 0 ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{blockers.join(". ")}.</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {PHASE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              tab === item.id
                ? "bg-sky-600 text-white"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <PhaseDetailEditor
        phase={phase}
        phases={season.phases}
        phaseKindZoneDefaults={season.phaseKindZoneDefaults}
        zoneFocusCatalog={zoneFocusCatalog}
        totalWeeks={season.totalWeeks}
        weeks={season.weeks}
        templates={templates}
        defaultPlanningMode={season.defaultPlanningMode ?? "BY_DISCIPLINE"}
        rampDefaults={season.rampDefaults}
        disciplineSettings={disciplineSettings}
        longRideWeekFlags={season.longRideWeekFlags ?? []}
        longRunWeekFlags={season.longRunWeekFlags ?? []}
        onLongRideWeekFlagsChange={(longRideWeekFlags) =>
          onSeasonChange({ ...season, longRideWeekFlags })
        }
        onLongRunWeekFlagsChange={(longRunWeekFlags) =>
          onSeasonChange({ ...season, longRunWeekFlags })
        }
        onChange={updatePhase}
        onDelete={deletePhase}
        phasesLocked={Boolean(season.trainerRoadDriven)}
        section={tab}
      />
      {tab === "layout" && phase.id ? (
        <MaterializePhasePanel
          seasonId={season.id}
          phaseId={phase.id}
          phaseName={phase.name}
          canGenerate={blockers.length === 0}
          blockers={blockers}
        />
      ) : null}
    </div>
  );
}

function WeekInspector({
  season,
  weekIndex,
  onSeasonChange,
}: {
  season: SimpleSeason;
  weekIndex: number;
  onSeasonChange: (season: SimpleSeason) => void;
}) {
  const week = season.weeks.find((item) => item.weekIndex === weekIndex);
  if (!week) return <p className="text-sm text-zinc-500">Week not found.</p>;
  const testFlags = season.testWeekFlags ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">Week {weekIndex + 1}</p>
      <p className="text-xs text-zinc-500">{week.weekStartDate}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={week.isRestWeek}
          onChange={(event) =>
            onSeasonChange({
              ...season,
              weeks: season.weeks.map((item) =>
                item.weekIndex === weekIndex ? { ...item, isRestWeek: event.target.checked } : item
              ),
            })
          }
        />
        Rest week
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={testFlags[weekIndex] ?? false}
          onChange={(event) => {
            const next = Array.from({ length: season.totalWeeks }, (_, i) => testFlags[i] ?? false);
            next[weekIndex] = event.target.checked;
            onSeasonChange({ ...season, testWeekFlags: next });
          }}
        />
        Test week
      </label>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {week.swimHours.toFixed(1)}h swim · {week.bikeHours.toFixed(1)}h bike ·{" "}
        {week.runHours.toFixed(1)}h run · {week.totalHours.toFixed(1)}h total
      </p>
      <p className="text-xs text-zinc-500">
        TiZ {Math.round(zoneMinutesForDiscipline(week.zoneMinutes, "SWIM"))}m swim ·{" "}
        {Math.round(zoneMinutesForDiscipline(week.zoneMinutes, "BIKE"))}m bike ·{" "}
        {Math.round(zoneMinutesForDiscipline(week.zoneMinutes, "RUN"))}m run
      </p>
    </div>
  );
}

function RaceInspector({
  season,
  eventKey,
  onSeasonChange,
}: {
  season: SimpleSeason;
  eventKey: string;
  onSeasonChange: (season: SimpleSeason) => void;
}) {
  const aRace = season.primaryGoalEvent ?? emptyRace("A");
  const bRaces = season.goalEvents.filter((event) => event.priority === "B");
  const cRaces = season.goalEvents.filter((event) => event.priority === "C");
  const all = [
    { ...aRace, priority: "A" as const },
    ...bRaces,
    ...cRaces,
  ];
  const selected =
    all.find((race, index) => raceEventKey(race, index) === eventKey) ?? aRace;

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">Races</p>
      <RaceSection
        aRace={aRace}
        bRaces={bRaces}
        cRaces={cRaces}
        onChange={(goalEvent, nextB, nextC) => {
          onSeasonChange({
            ...season,
            primaryGoalEvent: goalEvent,
            goalEvents: [
              { ...goalEvent, priority: "A" },
              ...nextB.map((event) => ({ ...event, priority: "B" as const })),
              ...nextC.map((event) => ({ ...event, priority: "C" as const })),
            ],
          });
        }}
      />
      {selected.name ? (
        <p className="text-xs text-zinc-500">Editing {selected.priority}-race {selected.name}.</p>
      ) : null}
    </div>
  );
}

function ProgramInspector({
  season,
  libraryPlans,
  attachedPlanSessionsById,
  windowsByAttachmentId,
  clashes,
  selectedWeekIndex,
  onSeasonChange,
  onRemoveProgram,
  onExtendSeason,
  busy,
}: {
  season: SimpleSeason;
  libraryPlans: Array<{ id: string; name: string; durationDays: number; sessionCount: number }>;
  attachedPlanSessionsById: Record<string, AttachedPlanSessionDraft[]>;
  windowsByAttachmentId: Record<
    string,
    {
      window: import("@/lib/plan/training-plan").ApplyWindowWithPausesResult;
      extension: import("@/lib/plan/training-plan").SeasonDateExtension | null;
    }
  >;
  clashes: PlanSessionClash[];
  selectedWeekIndex: number | null;
  onSeasonChange: (season: SimpleSeason) => void;
  onRemoveProgram: (index: number) => void;
  onExtendSeason: (extension: { startDate?: string; endDate?: string }) => void;
  busy: boolean;
}) {
  const attachments = season.trainingPlanAttachments ?? [];
  return (
    <SimplePlannerTrainingPlanPane
      attachments={attachments}
      plans={libraryPlans}
      goalEvents={season.goalEvents}
      weeks={season.weeks}
      selectedWeekIndex={selectedWeekIndex}
      windowsByAttachmentId={windowsByAttachmentId}
      clashes={clashes}
      conflicts={season.planSessionConflicts ?? []}
      sessionsByPlanId={attachedPlanSessionsById}
      onChange={(trainingPlanAttachments) =>
        onSeasonChange({
          ...season,
          trainingPlanAttachments,
          trainingPlanAttachment: trainingPlanAttachments[0] ?? null,
        })
      }
      onConflictsChange={(planSessionConflicts) =>
        onSeasonChange({ ...season, planSessionConflicts })
      }
      onRemove={onRemoveProgram}
      busy={busy}
      onPauseAllThisWeek={() => {
        const monday = selectedWeekIndex != null ? season.weeks[selectedWeekIndex]?.weekStartDate : null;
        if (!monday) return;
        onSeasonChange({
          ...season,
          trainingPlanAttachments: attachments.map((row) =>
            row.pausedWeeks.some((pause) => pause.weekStartDate === monday)
              ? row
              : { ...row, pausedWeeks: [...row.pausedWeeks, { weekStartDate: monday, weekCount: 1 }] }
          ),
        });
      }}
      onExtendSeason={onExtendSeason}
    />
  );
}

function SeasonInspector({
  season,
  templates,
  zoneFocusCatalog,
  disciplineSettings,
  onSeasonChange,
  onSelectTarget,
}: {
  season: SimpleSeason;
  templates: WeeklyTemplateOption[];
  zoneFocusCatalog: ZoneFocusCatalog;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onSeasonChange: (season: SimpleSeason) => void;
  onSelectTarget: (target: InspectorTarget) => void;
}) {
  const assigned = season.phases.filter(isAssignedPhase);
  const missingTemplate = assigned.filter((phase) => !phase.weeklyTemplateId);

  return (
    <div className="space-y-5">
      <div>
        <Label>Season name</Label>
        <Input
          value={season.name}
          onChange={(event) => onSeasonChange({ ...season, name: event.target.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Start date</Label>
          <Input
            type="date"
            value={season.startDate}
            onChange={(event) =>
              onSeasonChange({
                ...season,
                ...applySimpleSeasonDateBounds({
                  startDate: event.target.value,
                  endDate: season.endDate,
                  totalWeeks: season.totalWeeks,
                  phases: season.phases,
                  weeks: season.weeks,
                  rampDefaults: season.rampDefaults,
                }),
              })
            }
          />
        </div>
        <div>
          <Label>End date</Label>
          <Input
            type="date"
            value={season.endDate}
            onChange={(event) =>
              onSeasonChange({
                ...season,
                ...applySimpleSeasonDateBounds({
                  startDate: season.startDate,
                  endDate: event.target.value,
                  totalWeeks: season.totalWeeks,
                  phases: season.phases,
                  weeks: season.weeks,
                  rampDefaults: season.rampDefaults,
                }),
              })
            }
          />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">Races</p>
        <ul className="mt-1 space-y-1 text-sm">
          {(season.primaryGoalEvent ? [season.primaryGoalEvent] : [])
            .concat(season.goalEvents.filter((event) => event.priority !== "A"))
            .map((race, index) => (
              <li key={raceEventKey(race, index)}>
                <button
                  type="button"
                  className="text-sky-600 hover:underline"
                  onClick={() =>
                    onSelectTarget({ kind: "race", eventKey: raceEventKey(race, index) })
                  }
                >
                  {race.priority} · {race.name || "Untitled"} · {race.date}
                </button>
              </li>
            ))}
        </ul>
        <button
          type="button"
          className="mt-2 text-xs text-sky-600 hover:underline"
          onClick={() => onSelectTarget({ kind: "race", eventKey: "A-0" })}
        >
          Edit races
        </button>
      </div>
      <div>
        <p className="text-sm font-medium">Phases</p>
        <ul className="mt-1 space-y-1 text-sm">
          {assigned.map((phase) => {
            const blockers = phaseGenerateBlockers(phase);
            return (
              <li key={phase.id ?? phase.name}>
                <button
                  type="button"
                  className="text-sky-600 hover:underline"
                  onClick={() => onSelectTarget({ kind: "phase", phaseId: phase.id ?? phase.name })}
                >
                  {phase.name}
                </button>
                {blockers.length > 0 ? (
                  <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                    {blockers[0]}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {season.phases.filter(isEmptyPhase).map((phase) => (
          <div key={phase.id ?? phase.name} className="mt-1">
            <button
              type="button"
              className="text-sky-600 hover:underline"
              onClick={() => onSelectTarget({ kind: "phase", phaseId: phase.id ?? phase.name })}
            >
              {phase.name}
            </button>
            <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
              Assign this phase to weeks
            </span>
          </div>
        ))}
        {season.trainerRoadDriven ? null : (
          <button
            type="button"
            className="mt-2 text-xs text-sky-600 hover:underline"
            onClick={() => {
              const next = createEmptyPhase(
                season.phases.length + 1,
                season.phaseKindZoneDefaults
              );
              onSeasonChange({ ...season, phases: [...season.phases, next] });
              onSelectTarget({ kind: "phase", phaseId: next.id ?? next.name });
            }}
          >
            + Add phase
          </button>
        )}
        {missingTemplate.length > 0 ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {missingTemplate.length} phase{missingTemplate.length === 1 ? "" : "s"} still need a
            weekly template.
          </p>
        ) : null}
      </div>
      <details className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Default planning mode</Label>
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={season.defaultPlanningMode ?? "BY_DISCIPLINE"}
              onChange={(event) =>
                onSeasonChange({
                  ...season,
                  defaultPlanningMode: event.target.value as PlanningMode,
                })
              }
            >
              {PLANNING_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {PLANNING_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              {PLANNING_MODE_HELP[season.defaultPlanningMode ?? "BY_DISCIPLINE"]}
            </p>
          </div>
          <div>
            <Label>Max hours per week</Label>
            <NumberEditorInput
              nullable
              integer={false}
              min={1}
              className="mt-1"
              value={season.maxWeekHours ?? null}
              onCommit={(maxWeekHours) => onSeasonChange({ ...season, maxWeekHours })}
            />
          </div>
          <div>
            <Label>Rest week volume</Label>
            <div className="mt-1 flex items-center gap-2">
              <NumberEditorInput
                min={1}
                max={100}
                className="w-24"
                value={season.deLoadVolumePercent}
                onCommit={(next) => {
                  if (next == null) return;
                  onSeasonChange({
                    ...season,
                    deLoadVolumePercent: Math.min(100, Math.max(1, next)),
                  });
                }}
              />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          </div>
          <SeasonWeekTemplatePicker
            templates={templates}
            restWeekTemplateId={season.restWeekTemplateId ?? null}
            testWeekTemplateId={season.testWeekTemplateId ?? null}
            onRestChange={(restWeekTemplateId) => onSeasonChange({ ...season, restWeekTemplateId })}
            onTestChange={(testWeekTemplateId) => onSeasonChange({ ...season, testWeekTemplateId })}
          />
          <div>
            <p className="mb-2 text-sm font-medium">Phase kind zone defaults</p>
            <PhaseKindZoneDefaultsEditor
              value={season.phaseKindZoneDefaults}
              onChange={(phaseKindZoneDefaults) =>
                onSeasonChange({ ...season, phaseKindZoneDefaults })
              }
              catalog={zoneFocusCatalog}
              showPresetPercents
            />
            <p className="mt-2 text-xs text-zinc-500">
              <Link href="/settings/training" className="text-sky-600 hover:underline">
                Manage focus library in Settings
              </Link>
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Planning units</p>
            <SeasonUnitsEditor
              value={season.rampDefaults}
              disciplineSettings={disciplineSettings}
              onChange={(rampDefaults) => onSeasonChange({ ...season, rampDefaults })}
            />
          </div>
        </div>
      </details>
    </div>
  );
}

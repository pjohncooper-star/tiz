"use client";

import { useEffect, useMemo } from "react";
import { addWeeks, endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { Button } from "@/components/ui";
import { WorkoutPool } from "@/components/calendar/workout-pool";
import { WorkoutGraphPanel } from "@/components/calendar/workout-graph-composer";
import type { PoolWorkoutComposer } from "@/components/calendar/use-pool-workout-composer";
import type { CalendarWeekTarget } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import { computeUnscheduledChips } from "@/lib/plan/calendar/unscheduled-chips";
import {
  isEndurancePoolDiscipline,
  mergeChipsWithDrafts,
  type PoolCardDraftMap,
  type PoolDisciplineFilter,
} from "@/lib/plan/calendar/pool-session-card";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";

const WEEK_OPTS = { weekStartsOn: 1 as const };

export type WorkoutPoolWizardProps = {
  poolWeekStart: string;
  onPoolWeekChange: (weekStart: string) => void;
  weekTarget: CalendarWeekTarget | null;
  sessions: CalendarPlannedSession[];
  activities: CalendarWeekActivity[];
  currentWeekStart: string;
  drafts: PoolCardDraftMap;
  disciplineFilter: PoolDisciplineFilter;
  onDisciplineFilterChange: (filter: PoolDisciplineFilter) => void;
  selectedCardId: string | null;
  onSelectCard: (cardId: string) => void;
  builderExpanded: boolean;
  onBuilderExpandedChange: (expanded: boolean) => void;
  onBuilderDone: () => void;
  composer: PoolWorkoutComposer;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onAutoFillEasyTiz?: () => void;
};

function weekLabel(weekStart: string): string {
  const start = parseISO(`${weekStart}T12:00:00`);
  const end = endOfWeek(start, WEEK_OPTS);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

function usePoolWizardSelection(props: WorkoutPoolWizardProps) {
  const chips = useMemo(() => {
    if (!props.weekTarget) return [];
    return computeUnscheduledChips(props.poolWeekStart, props.weekTarget, props.sessions);
  }, [props.poolWeekStart, props.weekTarget, props.sessions]);

  const selectedCard = useMemo(() => {
    if (!props.selectedCardId) return null;
    return mergeChipsWithDrafts(chips, props.drafts).find((c) => c.id === props.selectedCardId) ?? null;
  }, [chips, props.drafts, props.selectedCardId]);

  const showBuilder =
    selectedCard != null &&
    isEndurancePoolDiscipline(selectedCard.discipline) &&
    props.builderExpanded;

  useEffect(() => {
    if (
      selectedCard &&
      isEndurancePoolDiscipline(selectedCard.discipline) &&
      props.composer.discipline !== selectedCard.discipline
    ) {
      props.composer.setDiscipline(selectedCard.discipline);
    }
    // Only sync when the selected card identity/discipline changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCard?.id, selectedCard?.discipline]);

  return { selectedCard, showBuilder };
}

function PoolWeekNav({
  poolWeekStart,
  onPoolWeekChange,
  weekTarget,
}: Pick<WorkoutPoolWizardProps, "poolWeekStart" | "onPoolWeekChange" | "weekTarget">) {
  function shiftPoolWeek(delta: number) {
    const next = addWeeks(parseISO(`${poolWeekStart}T12:00:00`), delta);
    onPoolWeekChange(format(startOfWeek(next, WEEK_OPTS), "yyyy-MM-dd"));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Workout pool</h2>
        {weekTarget?.phase ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: weekTarget.phase.color }}
              aria-hidden
            />
            {weekTarget.phase.name}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1"
          onClick={() => shiftPoolWeek(-1)}
          aria-label="Previous pool week"
        >
          ◀
        </Button>
        <span className="min-w-0 flex-1 text-center text-xs font-medium tabular-nums leading-tight">
          {weekLabel(poolWeekStart)}
        </span>
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1"
          onClick={() => shiftPoolWeek(1)}
          aria-label="Next pool week"
        >
          ▶
        </Button>
      </div>
    </div>
  );
}

/** Sticky side column: week nav, filter, and draggable session cards. */
export function WorkoutPoolWizardSideColumn(props: WorkoutPoolWizardProps) {
  const { weekTarget } = props;

  if (!weekTarget) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-zinc-50/95 p-3 dark:border-zinc-800 dark:bg-zinc-900/90">
        <PoolWeekNav
          poolWeekStart={props.poolWeekStart}
          onPoolWeekChange={props.onPoolWeekChange}
          weekTarget={weekTarget}
        />
        <p className="mt-3 text-sm text-zinc-500">
          No season targets for this week. The pool works for weeks inside your active plan.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-zinc-50/95 p-3 dark:border-zinc-800 dark:bg-zinc-900/90">
      <PoolWeekNav
        poolWeekStart={props.poolWeekStart}
        onPoolWeekChange={props.onPoolWeekChange}
        weekTarget={weekTarget}
      />
      <div className="mt-3 flex-1 overflow-y-auto border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <WorkoutPool
          weekTarget={weekTarget}
          sessions={props.sessions}
          activities={props.activities}
          weekStart={props.poolWeekStart}
          currentWeekStart={props.currentWeekStart}
          drafts={props.drafts}
          disciplineFilter={props.disciplineFilter}
          onDisciplineFilterChange={props.onDisciplineFilterChange}
          selectedCardId={props.selectedCardId}
          onSelectCard={props.onSelectCard}
          embedded
          section="cards"
          onAutoFillEasyTiz={props.onAutoFillEasyTiz}
        />
      </div>
    </div>
  );
}

/** Week TiZ and workout editor band (calendar column width in xl wizard mode). */
export function WorkoutPoolWizardBand(props: WorkoutPoolWizardProps) {
  const { weekTarget, composer, disciplineSettings } = props;
  const { selectedCard, showBuilder } = usePoolWizardSelection(props);

  if (!weekTarget) return null;

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <WorkoutPool
        weekTarget={weekTarget}
        sessions={props.sessions}
        activities={props.activities}
        weekStart={props.poolWeekStart}
        currentWeekStart={props.currentWeekStart}
        drafts={props.drafts}
        disciplineFilter={props.disciplineFilter}
        onDisciplineFilterChange={props.onDisciplineFilterChange}
        selectedCardId={props.selectedCardId}
        onSelectCard={props.onSelectCard}
        embedded
        section="tiz"
      />

      {showBuilder && selectedCard ? (
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <WorkoutGraphPanel
            composer={composer}
            disciplineSettings={disciplineSettings}
            expanded
            onExpandedChange={(expanded) => {
              if (!expanded) props.onBuilderDone();
              else props.onBuilderExpandedChange(true);
            }}
            lockDiscipline
            cardLabel={selectedCard.label}
          />
        </div>
      ) : null}
    </div>
  );
}

export function dateKeyInWeek(dateKey: string, weekStart: string): boolean {
  const monday = format(
    startOfWeek(parseISO(`${dateKey}T12:00:00`), WEEK_OPTS),
    "yyyy-MM-dd"
  );
  return monday === weekStart;
}

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

type WorkoutPoolWizardProps = {
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
};

function weekLabel(weekStart: string): string {
  const start = parseISO(`${weekStart}T12:00:00`);
  const end = endOfWeek(start, WEEK_OPTS);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

export function WorkoutPoolWizard({
  poolWeekStart,
  onPoolWeekChange,
  weekTarget,
  sessions,
  activities,
  currentWeekStart,
  drafts,
  disciplineFilter,
  onDisciplineFilterChange,
  selectedCardId,
  onSelectCard,
  builderExpanded,
  onBuilderExpandedChange,
  onBuilderDone,
  composer,
  disciplineSettings,
}: WorkoutPoolWizardProps) {
  const chips = useMemo(() => {
    if (!weekTarget) return [];
    return computeUnscheduledChips(poolWeekStart, weekTarget, sessions);
  }, [poolWeekStart, weekTarget, sessions]);

  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return mergeChipsWithDrafts(chips, drafts).find((c) => c.id === selectedCardId) ?? null;
  }, [chips, drafts, selectedCardId]);

  const showBuilder =
    selectedCard != null &&
    isEndurancePoolDiscipline(selectedCard.discipline) &&
    builderExpanded;

  useEffect(() => {
    if (
      selectedCard &&
      isEndurancePoolDiscipline(selectedCard.discipline) &&
      composer.discipline !== selectedCard.discipline
    ) {
      composer.setDiscipline(selectedCard.discipline);
    }
    // Only sync when the selected card identity/discipline changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCard?.id, selectedCard?.discipline]);

  function shiftPoolWeek(delta: number) {
    const next = addWeeks(parseISO(`${poolWeekStart}T12:00:00`), delta);
    onPoolWeekChange(format(startOfWeek(next, WEEK_OPTS), "yyyy-MM-dd"));
  }

  return (
    <div className="relative rounded-lg border border-zinc-200 bg-zinc-50/95 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            onClick={() => shiftPoolWeek(-1)}
            aria-label="Previous pool week"
          >
            ◀
          </Button>
          <span className="min-w-[10rem] text-center text-sm font-medium tabular-nums">
            {weekLabel(poolWeekStart)}
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => shiftPoolWeek(1)}
            aria-label="Next pool week"
          >
            ▶
          </Button>
        </div>
      </div>

      {!weekTarget ? (
        <p className="text-sm text-zinc-500">
          No season targets for this week. The pool works for weeks inside your active plan.
        </p>
      ) : (
        <>
          <WorkoutPool
            weekTarget={weekTarget}
            sessions={sessions}
            activities={activities}
            weekStart={poolWeekStart}
            currentWeekStart={currentWeekStart}
            drafts={drafts}
            disciplineFilter={disciplineFilter}
            onDisciplineFilterChange={onDisciplineFilterChange}
            selectedCardId={selectedCardId}
            onSelectCard={onSelectCard}
            embedded
          />

          {showBuilder ? (
            <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <WorkoutGraphPanel
                composer={composer}
                disciplineSettings={disciplineSettings}
                expanded
                onExpandedChange={(expanded) => {
                  if (!expanded) onBuilderDone();
                  else onBuilderExpandedChange(true);
                }}
                lockDiscipline
                cardLabel={selectedCard.label}
              />
            </div>
          ) : null}
        </>
      )}
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

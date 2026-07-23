"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  addWeeks,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { DayCalendarPicker } from "@/components/day-calendar-picker";
import { CalendarWeekRow } from "@/components/calendar/calendar-week-row";
import { CalendarSessionCard } from "@/components/calendar/calendar-session-card";
import { DraggableActivityCard } from "@/components/calendar/calendar-activity-card";
import { ApplyTemplateDialog } from "@/components/calendar/apply-template-dialog";
import { WorkoutUploadButton } from "@/components/workout-upload-button";
import type { CalendarRangeData } from "@/components/calendar/types";
import type { CalendarPlannedSession } from "@/lib/plan/calendar/serialize";
import type { CalendarWeekActivity } from "@/lib/plan/calendar/activity-serialize";
import { totalZoneMinutes } from "@/lib/workout/steps";
import type { UnscheduledChip, PoolDiscipline } from "@/lib/plan/calendar/unscheduled-chips";
import type { PoolLibraryTemplate } from "@/lib/plan/calendar/pool-library";
import {
  PoolSessionCardPreview,
  unscheduledSessionTitle,
} from "@/components/calendar/workout-pool";
import {
  WorkoutPoolWizardBand,
  WorkoutPoolWizardSideColumn,
  dateKeyInWeek,
  type WorkoutPoolWizardProps,
} from "@/components/calendar/workout-pool-wizard";
import { SessionRolePickerDialog } from "@/components/calendar/session-role-picker-dialog";
import { inheritTargetZonesFromRole } from "@/lib/plan/calendar/inherit-target-zones";
import { sessionRoleForChip } from "@/lib/plan/calendar/session-role-for-chip";
import {
  computeUnscheduledChips,
  findNextUnplannedWeekStart,
  weekHasUnplannedPoolSessions,
} from "@/lib/plan/calendar/unscheduled-chips";
import {
  draftFromNodes,
  isEndurancePoolDiscipline,
  pruneDraftsToPoolTargets,
  treeFromDraft,
  type PoolCardDraft,
  type PoolCardDraftMap,
  type PoolDisciplineFilter,
  type PoolSessionCard,
} from "@/lib/plan/calendar/pool-session-card";
import {
  applyTargetSessionId,
  fillableGeneratedSessionIds,
  generatedPoolCardId,
  generatedSessionDraftEntries,
  isComposableCalendarSession,
  isEditableCalendarSession,
  isFillableGeneratedSession,
  parseGeneratedPoolCardId,
  parseStagingPoolCardId,
  stagingPoolCardId,
} from "@/lib/plan/calendar/generated-pool-cards";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import type { SessionRole, Discipline } from "@prisma/client";
import {
  isAssembledWorkoutDrag,
  isPoolPlacementDragId,
} from "@/lib/plan/workout-builder-dnd";
import {
  parseActivityDragId,
  parseSessionLinkDropId,
} from "@/lib/plan/session-link";
import { useWorkoutBuilder } from "@/components/calendar/use-workout-builder";
import { usePoolWorkoutComposer } from "@/components/calendar/use-pool-workout-composer";
import { WorkoutBuilderPane } from "@/components/calendar/workout-builder-pane";
import { WORKOUT_TREE_VERSION } from "@/lib/workout/workout-tree";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";
import type { WorkoutShadingSettings, WorkoutShadingTarget } from "@/lib/plan/workout-shading";
import type { PlanDiscipline } from "@/lib/plan/session";
import { Button } from "@/components/ui";
import { computeEasyTizSpread, computeLongPoolDrafts } from "@/lib/plan/calendar/spread-easy-tiz";
import type { PaceThresholdContext } from "@/lib/plan/pace-threshold-context";
import {
  calendarStickyOffsetPx,
  pickFirstFullyVisibleWeek,
  scrollElementBelowSticky,
} from "@/lib/plan/calendar/week-scroll-focus";

const WEEK_OPTS = { weekStartsOn: 1 as const };
const MAX_PAST_WEEKS_WITHOUT_ACTIVITIES = 52;

/** Persist an autofill draft onto a fillable generated PlannedSession. */
async function persistGeneratedSessionDraft(
  sessionId: string,
  draft: PoolCardDraft
): Promise<boolean> {
  const body: Record<string, unknown> = {
    steps: { version: WORKOUT_TREE_VERSION, nodes: draft.nodes },
  };
  if (draft.distanceMeters != null && draft.distanceMeters > 0) {
    body.distanceMeters = draft.distanceMeters;
  }
  if (draft.targetPaceSeconds != null && draft.targetPaceSeconds > 0) {
    body.targetPaceSeconds = draft.targetPaceSeconds;
  }
  if (draft.targetSpeedMps != null && draft.targetSpeedMps > 0) {
    body.targetSpeedMps = draft.targetSpeedMps;
  }
  const res = await fetch(`/api/plan/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

type PlanningCalendarProps = {
  initialData: CalendarRangeData;
  currentWeekStart: string;
  initialScrollWeekStart?: string | null;
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  workoutShadingSettings: WorkoutShadingSettings;
  workoutShadingTarget: WorkoutShadingTarget;
  ecoLoadEnabled?: boolean;
  activityDates: string[];
  minDate: string | null;
  maxDate: string | null;
  paceContext?: PaceThresholdContext | null;
};

function mergeRangeData(
  prev: CalendarRangeData,
  next: CalendarRangeData
): CalendarRangeData {
  const sessionMap = new Map(prev.sessions.map((s) => [s.id, s]));
  for (const s of next.sessions) sessionMap.set(s.id, s);

  const activityMap = new Map(prev.activities.map((a) => [a.id, a]));
  for (const a of next.activities) activityMap.set(a.id, a);

  const weekSet = new Set([...prev.weekStarts, ...next.weekStarts]);
  const weekStarts = [...weekSet].sort();

  const targetMap = new Map(prev.weekTargets.map((t) => [t.weekStart, t]));
  for (const t of next.weekTargets) targetMap.set(t.weekStart, t);

  return {
    sessions: [...sessionMap.values()],
    activities: [...activityMap.values()],
    weekStarts,
    weekTargets: [...targetMap.values()],
  };
}

export function PlanningCalendar({
  initialData,
  currentWeekStart,
  initialScrollWeekStart,
  disciplineSettings,
  workoutShadingSettings,
  workoutShadingTarget,
  ecoLoadEnabled = false,
  activityDates,
  minDate,
  maxDate,
  paceContext = null,
}: PlanningCalendarProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activePoolCard, setActivePoolCard] = useState<PoolSessionCard | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyWeekStart, setApplyWeekStart] = useState(currentWeekStart);
  const [applyHasSessions, setApplyHasSessions] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [focusedWeekStart, setFocusedWeekStart] = useState(
    () => initialScrollWeekStart ?? currentWeekStart
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [isXl, setIsXl] = useState(false);
  const [editorBandHeightPx, setEditorBandHeightPx] = useState(0);
  // Pool week for the wizard; changing it scrolls the calendar to match.
  const [poolWeekStart, setPoolWeekStart] = useState(
    () => initialScrollWeekStart ?? currentWeekStart
  );
  const [pendingRolePick, setPendingRolePick] = useState<{
    chip: UnscheduledChip;
    dateKey: string;
  } | null>(null);
  const [poolDrafts, setPoolDrafts] = useState<PoolCardDraftMap>({});
  const [poolDisciplineFilter, setPoolDisciplineFilter] =
    useState<PoolDisciplineFilter>("ALL");
  const [selectedPoolCardId, setSelectedPoolCardId] = useState<string | null>(null);
  const [builderExpanded, setBuilderExpanded] = useState(false);
  const loadSentinelRef = useRef<HTMLDivElement>(null);
  const loadPreviousSentinelRef = useRef<HTMLDivElement>(null);
  const editorBandRef = useRef<HTMLDivElement>(null);
  const pendingPoolScrollRef = useRef<string | null>(null);
  const scrolledRef = useRef(false);
  const canLoadPreviousRef = useRef(false);
  const focusLockUntilRef = useRef(0);
  const pendingScrollRestoreRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(
    null
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const workoutBuilder = useWorkoutBuilder({
    onApplied: () => void handleRefresh(),
  });

  const useWizardPool = poolOpen && isXl;
  const stickyOffsetPx = calendarStickyOffsetPx({
    editorBandHeightPx,
    includeEditorBand: useWizardPool,
  });
  const stickyOffsetPxRef = useRef(stickyOffsetPx);
  stickyOffsetPxRef.current = stickyOffsetPx;
  const composerActive = useWizardPool && selectedPoolCardId != null && builderExpanded;
  const generatedWorkoutAppliedRef = useRef<(sessionId: string) => void>(() => {});
  const boundApplySessionId = applyTargetSessionId(selectedPoolCardId);

  const poolComposer = usePoolWorkoutComposer({
    active: composerActive || useWizardPool,
    allowOverwriteSessionId: boundApplySessionId,
    onApplied: () => void handleRefresh(),
    onWorkoutApplied: (sessionId) => generatedWorkoutAppliedRef.current(sessionId),
  });

  const setFocusedWeek = useCallback((weekStart: string, options?: { lockMs?: number }) => {
    if (options?.lockMs) {
      focusLockUntilRef.current = Date.now() + options.lockMs;
    }
    setFocusedWeekStart((prev) => (prev === weekStart ? prev : weekStart));
    setSelectedDateKey((prev) => {
      if (!prev) return prev;
      const dayWeek = format(
        startOfWeek(parseISO(`${prev}T12:00:00`), WEEK_OPTS),
        "yyyy-MM-dd"
      );
      return dayWeek === weekStart ? prev : null;
    });
  }, []);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => {
      setIsXl(mq.matches);
      setPoolOpen(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    if (!useWizardPool) {
      setEditorBandHeightPx(0);
      return;
    }
    const el = editorBandRef.current;
    if (!el) {
      setEditorBandHeightPx(0);
      return;
    }
    const measure = () => {
      setEditorBandHeightPx(el.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [useWizardPool, selectedPoolCardId, builderExpanded, poolWeekStart]);

  const poolDropWeekStart = useWizardPool ? poolWeekStart : null;

  const sortedWeeks = useMemo(
    () => [...data.weekStarts].sort(),
    [data.weekStarts]
  );

  const ensurePoolWeekLoaded = useCallback(
    async (weekStart: string) => {
      const hasWeek = data.weekStarts.includes(weekStart);
      const hasTarget = data.weekTargets.some((target) => target.weekStart === weekStart);
      if (hasWeek && hasTarget) return;

      const to = format(
        endOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS),
        "yyyy-MM-dd"
      );
      try {
        const res = await fetch(
          `/api/plan/calendar/range?from=${encodeURIComponent(weekStart)}&to=${encodeURIComponent(to)}`
        );
        if (res.ok) {
          const next: CalendarRangeData = await res.json();
          setData((prev) => mergeRangeData(prev, next));
        }
      } catch {
        // ignore
      }
    },
    [data.weekStarts, data.weekTargets]
  );

  useEffect(() => {
    if (!useWizardPool) return;
    void ensurePoolWeekLoaded(poolWeekStart);
  }, [ensurePoolWeekLoaded, poolWeekStart, useWizardPool]);

  const sessionsForWeek = useCallback(
    (weekStart: string) => {
      const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
      const end = endOfWeek(start, WEEK_OPTS);
      return data.sessions.filter((s) => {
        const d = parseISO(`${s.scheduledDate}T12:00:00`);
        return d >= start && d <= end;
      });
    },
    [data.sessions]
  );

  const activitiesForWeek = useCallback(
    (weekStart: string) => {
      const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
      const end = endOfWeek(start, WEEK_OPTS);
      return data.activities.filter((a) => {
        const d = parseISO(a.startTime);
        return d >= start && d <= end;
      });
    },
    [data.activities]
  );

  const targetsByWeek = useMemo(
    () => new Map(data.weekTargets.map((t) => [t.weekStart, t])),
    [data.weekTargets]
  );

  const poolWeekTarget = targetsByWeek.get(poolWeekStart) ?? null;
  const poolWeekSessions = sessionsForWeek(poolWeekStart);
  const poolWeekActivities = activitiesForWeek(poolWeekStart);

  const poolChips = useMemo(() => {
    if (!poolWeekTarget) return [];
    return computeUnscheduledChips(poolWeekStart, poolWeekTarget, poolWeekSessions);
  }, [poolWeekStart, poolWeekTarget, poolWeekSessions]);

  const poolGeneratedCardIds = useMemo(() => {
    return [...fillableGeneratedSessionIds(poolWeekSessions)].map((sessionId) =>
      generatedPoolCardId(sessionId)
    );
  }, [poolWeekSessions]);

  const poolDraftCardIds = useMemo(() => {
    const ids = [...poolChips.map((chip) => chip.id), ...poolGeneratedCardIds];
    const stagingDiscipline = selectedPoolCardId
      ? parseStagingPoolCardId(selectedPoolCardId)
      : null;
    if (stagingDiscipline) ids.push(stagingPoolCardId(stagingDiscipline));
    return ids;
  }, [poolChips, poolGeneratedCardIds, selectedPoolCardId]);

  const clearGeneratedPoolSelection = useCallback(
    (sessionId: string) => {
      const cardId = generatedPoolCardId(sessionId);
      setPoolDrafts((prev) => {
        if (!(cardId in prev)) return prev;
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setSelectedPoolCardId((prev) => {
        if (prev !== cardId) return prev;
        setBuilderExpanded(false);
        poolComposer.clear();
        return null;
      });
    },
    [poolComposer]
  );

  generatedWorkoutAppliedRef.current = clearGeneratedPoolSelection;

  useEffect(() => {
    setPoolDrafts((prev) => {
      const pruned = pruneDraftsToPoolTargets(prev, poolDraftCardIds);
      if (!poolWeekTarget) return pruned;

      const longDrafts = computeLongPoolDrafts({
        weekTarget: poolWeekTarget,
        drafts: pruned,
        chips: poolChips,
        sessions: poolWeekSessions,
        paceContext,
      });

      if (Object.keys(longDrafts).length === 0) return pruned;

      const next = { ...pruned };
      let changed = pruned !== prev;
      for (const [id, draft] of Object.entries(longDrafts)) {
        if (!(id in next)) {
          next[id] = draft;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setSelectedPoolCardId((prev) => {
      if (!prev) return prev;
      return poolDraftCardIds.includes(prev) ? prev : null;
    });
  }, [poolChips, poolDraftCardIds, poolWeekSessions, poolWeekTarget, paceContext]);

  const handleAutoFillEasyTizForWeek = useCallback(
    async (weekStart: string) => {
      const weekTarget = targetsByWeek.get(weekStart);
      if (!weekTarget) return;
      const weekSessions = sessionsForWeek(weekStart);
      const chips = computeUnscheduledChips(weekStart, weekTarget, weekSessions);
      const generated = computeEasyTizSpread({
        weekTarget,
        sessions: weekSessions,
        drafts: poolDrafts,
        chips,
        disciplineFilter: poolDisciplineFilter,
        paceContext,
      });

      const merged: PoolCardDraftMap = { ...poolDrafts };
      for (const [id, draft] of Object.entries(generated)) {
        if (!(id in merged)) merged[id] = draft;
      }

      // Persist every generated-session draft onto the calendar card (including
      // long drafts seeded earlier). Pool chips stay as in-memory drafts.
      const appliedCardIds: string[] = [];
      for (const { cardId, sessionId, draft } of generatedSessionDraftEntries(merged)) {
        const session = weekSessions.find((row) => row.id === sessionId);
        if (!session || !isFillableGeneratedSession(session)) continue;
        const ok = await persistGeneratedSessionDraft(sessionId, draft);
        if (ok) {
          appliedCardIds.push(cardId);
          clearGeneratedPoolSelection(sessionId);
        }
      }

      setPoolDrafts((prev) => {
        const next = { ...prev };
        for (const [id, draft] of Object.entries(generated)) {
          if (!(id in next)) next[id] = draft;
        }
        for (const id of appliedCardIds) {
          delete next[id];
        }
        return next;
      });

      if (appliedCardIds.length > 0) await handleRefresh();
    },
    [
      targetsByWeek,
      sessionsForWeek,
      poolDrafts,
      poolDisciplineFilter,
      paceContext,
      clearGeneratedPoolSelection,
    ]
  );

  const handleAutoFillEasyTiz = useCallback(() => {
    void handleAutoFillEasyTizForWeek(poolWeekStart);
  }, [handleAutoFillEasyTizForWeek, poolWeekStart]);

  const handleSelectPoolCard = useCallback(
    (cardId: string) => {
      const saveCurrentDraft = () => {
        if (!selectedPoolCardId || !builderExpanded || selectedPoolCardId === cardId) return;
        const draft = draftFromNodes(
          poolComposer.workoutTree.nodes,
          poolComposer.discipline
        );
        setPoolDrafts((prev) => {
          const next = { ...prev };
          if (draft) next[selectedPoolCardId] = draft;
          else delete next[selectedPoolCardId];
          return next;
        });
      };

      const generatedSessionId = parseGeneratedPoolCardId(cardId);
      if (generatedSessionId) {
        const session = data.sessions.find((row) => row.id === generatedSessionId);
        if (!session || !isComposableCalendarSession(session)) return;
        if (!isEndurancePoolDiscipline(session.discipline as PoolDiscipline)) return;

        const sessionWeekStart = format(
          startOfWeek(parseISO(`${session.scheduledDate}T12:00:00`), WEEK_OPTS),
          "yyyy-MM-dd"
        );
        if (sessionWeekStart !== poolWeekStart) {
          setPoolWeekStart(sessionWeekStart);
          void ensurePoolWeekLoaded(sessionWeekStart);
          pendingPoolScrollRef.current = sessionWeekStart;
        }

        const stagingDiscipline = parseStagingPoolCardId(selectedPoolCardId ?? "");
        const keepComposerTree =
          stagingDiscipline != null &&
          stagingDiscipline === session.discipline &&
          poolComposer.workoutTree.nodes.length > 0;

        saveCurrentDraft();
        setSelectedPoolCardId(cardId);
        poolComposer.setDiscipline(session.discipline as "SWIM" | "BIKE" | "RUN");
        if (!keepComposerTree) {
          if (isEditableCalendarSession(session)) {
            const sourceLabel = `${session.title} · ${format(
              parseISO(`${session.scheduledDate}T12:00:00`),
              "EEE MMM d"
            )}`;
            void poolComposer.loadFromSession(session.id, sourceLabel);
          } else {
            poolComposer.setWorkoutTree(treeFromDraft(poolDrafts[cardId]));
          }
        }
        setBuilderExpanded(true);
        return;
      }

      const stagingDiscipline = parseStagingPoolCardId(cardId);
      if (stagingDiscipline) {
        saveCurrentDraft();
        setSelectedPoolCardId(cardId);
        poolComposer.setDiscipline(stagingDiscipline);
        poolComposer.setWorkoutTree(treeFromDraft(poolDrafts[cardId]));
        setBuilderExpanded(true);
        return;
      }

      const chip = poolChips.find((c) => c.id === cardId);
      if (!chip || !isEndurancePoolDiscipline(chip.discipline)) return;

      saveCurrentDraft();
      setSelectedPoolCardId(cardId);
      poolComposer.setDiscipline(chip.discipline);
      poolComposer.setWorkoutTree(treeFromDraft(poolDrafts[cardId]));
      setBuilderExpanded(true);
    },
    [
      data.sessions,
      poolChips,
      poolWeekStart,
      ensurePoolWeekLoaded,
      selectedPoolCardId,
      builderExpanded,
      poolComposer,
      poolDrafts,
    ]
  );

  const handleApplyToBuildTarget = useCallback(async () => {
    const sessionId = applyTargetSessionId(selectedPoolCardId);
    if (!sessionId) {
      alert("Select a calendar session to save this workout.");
      return;
    }

    const session = data.sessions.find((row) => row.id === sessionId);
    if (!session) {
      alert("Session not found");
      return;
    }
    if (session.discipline !== poolComposer.discipline) {
      alert(
        `Workout is ${poolComposer.discipline}; that session is ${session.discipline}.`
      );
      return;
    }
    if (session.source === "RACE") {
      alert("Cannot save workout to a race session");
      return;
    }
    if (poolComposer.workoutTree.nodes.length === 0) {
      alert("Build a workout before saving.");
      return;
    }

    await poolComposer.applyToSession(sessionId);
  }, [data.sessions, poolComposer, selectedPoolCardId]);

  const handleArmBuildFromSession = useCallback(
    (session: CalendarPlannedSession) => {
      if (!isFillableGeneratedSession(session)) return;
      if (!poolOpen) setPoolOpen(true);
      handleSelectPoolCard(generatedPoolCardId(session.id));
    },
    [handleSelectPoolCard, poolOpen]
  );

  const handleEditWorkout = useCallback(
    async (session: CalendarPlannedSession) => {
      if (!isEditableCalendarSession(session)) return;
      if (!poolOpen) setPoolOpen(true);

      if (
        selectedPoolCardId &&
        builderExpanded &&
        selectedPoolCardId !== generatedPoolCardId(session.id)
      ) {
        const draft = draftFromNodes(poolComposer.workoutTree.nodes, poolComposer.discipline);
        setPoolDrafts((prev) => {
          const next = { ...prev };
          if (draft) next[selectedPoolCardId] = draft;
          else delete next[selectedPoolCardId];
          return next;
        });
      }

      const sourceLabel = `${session.title} · ${format(
        parseISO(`${session.scheduledDate}T12:00:00`),
        "EEE MMM d"
      )}`;
      const ok = await poolComposer.loadFromSession(session.id, sourceLabel);
      if (ok) {
        setSelectedPoolCardId(generatedPoolCardId(session.id));
        setBuilderExpanded(true);

        const sessionWeekStart = format(
          startOfWeek(parseISO(`${session.scheduledDate}T12:00:00`), WEEK_OPTS),
          "yyyy-MM-dd"
        );
        if (sessionWeekStart !== poolWeekStart) {
          setPoolWeekStart(sessionWeekStart);
          void ensurePoolWeekLoaded(sessionWeekStart);
          pendingPoolScrollRef.current = sessionWeekStart;
        }
      }
    },
    [
      poolOpen,
      selectedPoolCardId,
      builderExpanded,
      poolComposer,
      poolWeekStart,
      ensurePoolWeekLoaded,
    ]
  );

  const handleDuplicateWorkout = useCallback(
    async (session: CalendarPlannedSession) => {
      if (!isEditableCalendarSession(session)) return;
      if (session.discipline === "STRENGTH") {
        alert("Strength sessions are not supported in the Build graph");
        return;
      }
      if (!isEndurancePoolDiscipline(session.discipline as PoolDiscipline)) return;

      const targetId = applyTargetSessionId(selectedPoolCardId);
      const target = targetId ? data.sessions.find((row) => row.id === targetId) : null;
      if (!target || !isFillableGeneratedSession(target)) {
        alert(
          "Select an empty session with Build first, then Duplicate from another session."
        );
        return;
      }
      if (target.discipline !== session.discipline) {
        alert(
          `Target session is ${target.discipline}; that workout is ${session.discipline}.`
        );
        return;
      }
      if (!poolOpen) setPoolOpen(true);

      const sourceLabel = `${session.title} · ${format(
        parseISO(`${session.scheduledDate}T12:00:00`),
        "EEE MMM d"
      )}`;
      const ok = await poolComposer.loadFromSession(session.id, sourceLabel);
      if (ok) {
        setBuilderExpanded(true);
      }
    },
    [data.sessions, selectedPoolCardId, poolOpen, poolComposer]
  );

  const handleBuilderDone = useCallback(() => {
    if (!selectedPoolCardId) {
      setBuilderExpanded(false);
      return;
    }
    const draft = draftFromNodes(poolComposer.workoutTree.nodes, poolComposer.discipline);
    setPoolDrafts((prev) => {
      const next = { ...prev };
      if (draft) next[selectedPoolCardId] = draft;
      else delete next[selectedPoolCardId];
      return next;
    });
    setBuilderExpanded(false);
  }, [selectedPoolCardId, poolComposer]);

  function poolWeekAllowsDate(dateKey: string | undefined): boolean {
    if (!dateKey) return false;
    if (!poolDropWeekStart) return true;
    return dateKeyInWeek(dateKey, poolDropWeekStart);
  }

  function poolAllowsOver(overData: Record<string, unknown> | undefined): boolean {
    if (!poolDropWeekStart) return true;
    if (!overData) return false;
    if (overData.type === "pool-unscheduled-drop") return true;
    if (overData.type === "day") {
      return poolWeekAllowsDate(overData.dateKey as string | undefined);
    }
    if (overData.type === "session-workout" || overData.type === "session-link") {
      const sessionId = overData.sessionId as string | undefined;
      if (!sessionId) return false;
      const session = data.sessions.find((s) => s.id === sessionId);
      return session ? poolWeekAllowsDate(session.scheduledDate) : false;
    }
    return true;
  }

  useEffect(() => {
    if (!useWizardPool) return;
    setSelectedDateKey((prev) => {
      if (!prev) return prev;
      return dateKeyInWeek(prev, poolWeekStart) ? prev : null;
    });
  }, [poolWeekStart, useWizardPool]);

  const activeSession = activeDragId
    ? data.sessions.find((s) => s.id === activeDragId)
    : null;

  const activeActivityId = activeDragId ? parseActivityDragId(activeDragId) : null;
  const activeActivity = activeActivityId
    ? data.activities.find((a) => a.id === activeActivityId)
    : null;

  const scrollToWeekAsync = useCallback(
    async (weekStart: string) => {
      setFocusedWeek(weekStart, { lockMs: 1200 });
      const scroll = () => {
        const el = document.querySelector(`[data-week-start="${weekStart}"]`);
        if (!(el instanceof HTMLElement)) return;
        scrollElementBelowSticky(el, stickyOffsetPxRef.current, "smooth");
      };

      if (sortedWeeks.includes(weekStart)) {
        scroll();
        return;
      }

      const from = weekStart;
      const to = format(endOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS), "yyyy-MM-dd");

      try {
        const res = await fetch(
          `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        );
        if (res.ok) {
          const next: CalendarRangeData = await res.json();
          setData((prev) => mergeRangeData(prev, next));
          requestAnimationFrame(() => scroll());
        }
      } catch {
        // ignore
      }
    },
    [setFocusedWeek, sortedWeeks]
  );

  const handlePoolWeekChange = useCallback(
    (weekStart: string) => {
      setPoolWeekStart(weekStart);
      void ensurePoolWeekLoaded(weekStart);
      pendingPoolScrollRef.current = weekStart;
    },
    [ensurePoolWeekLoaded]
  );

  useEffect(() => {
    if (pendingPoolScrollRef.current !== poolWeekStart) return;

    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || pendingPoolScrollRef.current !== poolWeekStart) return;
        pendingPoolScrollRef.current = null;
        void scrollToWeekAsync(poolWeekStart);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [poolWeekStart, selectedPoolCardId, builderExpanded, poolWeekTarget, scrollToWeekAsync]);

  const weekHasUnplanned = useCallback(
    (weekStart: string) =>
      weekHasUnplannedPoolSessions(
        weekStart,
        targetsByWeek.get(weekStart),
        sessionsForWeek(weekStart)
      ),
    [targetsByWeek, sessionsForWeek]
  );

  const poolNavigationWeekStart = useWizardPool ? poolWeekStart : focusedWeekStart;

  const goToNextUnplannedWeek = useCallback(async () => {
    setCalendarOpen(false);

    const fromWeek = poolNavigationWeekStart;
    const loaded = findNextUnplannedWeekStart(fromWeek, sortedWeeks, weekHasUnplanned);
    if (loaded) {
      handlePoolWeekChange(loaded);
      return;
    }

    let cursor = addWeeks(parseISO(`${fromWeek}T12:00:00`), 1);
    const maxWeekStart = maxDate
      ? format(startOfWeek(parseISO(`${maxDate}T12:00:00`), WEEK_OPTS), "yyyy-MM-dd")
      : null;

    for (let i = 0; i < 104; i++) {
      const weekStart = format(startOfWeek(cursor, WEEK_OPTS), "yyyy-MM-dd");
      if (maxWeekStart && weekStart > maxWeekStart) break;

      const to = format(endOfWeek(cursor, WEEK_OPTS), "yyyy-MM-dd");
      try {
        const res = await fetch(
          `/api/plan/calendar/range?from=${encodeURIComponent(weekStart)}&to=${encodeURIComponent(to)}`
        );
        if (!res.ok) break;
        const next: CalendarRangeData = await res.json();
        setData((prev) => mergeRangeData(prev, next));

        const target = next.weekTargets.find((row) => row.weekStart === weekStart) ?? null;
        const weekSessions = next.sessions.filter((session) => {
          const start = startOfWeek(parseISO(`${weekStart}T12:00:00`), WEEK_OPTS);
          const end = endOfWeek(start, WEEK_OPTS);
          const d = parseISO(`${session.scheduledDate}T12:00:00`);
          return d >= start && d <= end;
        });

        if (weekHasUnplannedPoolSessions(weekStart, target, weekSessions)) {
          handlePoolWeekChange(weekStart);
          return;
        }
      } catch {
        break;
      }

      cursor = addWeeks(cursor, 1);
    }

    alert("No upcoming weeks with unplanned pool sessions.");
  }, [
    handlePoolWeekChange,
    maxDate,
    poolNavigationWeekStart,
    sortedWeeks,
    weekHasUnplanned,
  ]);

  useEffect(() => {
    if (scrolledRef.current) return;
    scrolledRef.current = true;

    const targetWeek = initialScrollWeekStart ?? currentWeekStart;

    const scrollToTarget = () => {
      const byWeek = document.querySelector(`[data-week-start="${targetWeek}"]`);
      if (byWeek instanceof HTMLElement) {
        scrollElementBelowSticky(byWeek, stickyOffsetPxRef.current, "auto");
        return;
      }
      if (targetWeek === currentWeekStart) {
        const current = document.getElementById("calendar-current-week");
        if (current instanceof HTMLElement) {
          scrollElementBelowSticky(current, stickyOffsetPxRef.current, "auto");
        }
      }
    };

    if (initialScrollWeekStart && !sortedWeeks.includes(initialScrollWeekStart)) {
      void scrollToWeekAsync(initialScrollWeekStart).finally(() => {
        requestAnimationFrame(() => {
          canLoadPreviousRef.current = true;
        });
      });
      return;
    }

    scrollToTarget();
    requestAnimationFrame(() => {
      canLoadPreviousRef.current = true;
    });
  }, [currentWeekStart, initialScrollWeekStart, scrollToWeekAsync, sortedWeeks]);

  const earliestLoadableWeek = useMemo(() => {
    if (minDate) {
      return format(startOfWeek(parseISO(`${minDate}T12:00:00`), WEEK_OPTS), "yyyy-MM-dd");
    }
    return format(
      addWeeks(parseISO(`${currentWeekStart}T12:00:00`), -MAX_PAST_WEEKS_WITHOUT_ACTIVITIES),
      "yyyy-MM-dd"
    );
  }, [currentWeekStart, minDate]);

  const canLoadPrevious = useMemo(() => {
    if (sortedWeeks.length === 0) return false;
    return sortedWeeks[0] > earliestLoadableWeek;
  }, [earliestLoadableWeek, sortedWeeks]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending) return;
    pendingScrollRestoreRef.current = null;
    const delta = document.documentElement.scrollHeight - pending.prevScrollHeight;
    window.scrollTo(0, pending.prevScrollTop + delta);
  }, [sortedWeeks]);

  const loadMoreWeeks = useCallback(async () => {
    if (loadingMore || sortedWeeks.length === 0) return;
    const lastWeek = sortedWeeks[sortedWeeks.length - 1];
    const from = format(addWeeks(parseISO(`${lastWeek}T12:00:00`), 1), "yyyy-MM-dd");
    const to = format(
      endOfWeek(addWeeks(parseISO(`${from}T12:00:00`), 1), WEEK_OPTS),
      "yyyy-MM-dd"
    );

    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (res.ok) {
        const next: CalendarRangeData = await res.json();
        setData((prev) => mergeRangeData(prev, next));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, sortedWeeks]);

  const loadPreviousWeeks = useCallback(async () => {
    if (loadingPrevious || !canLoadPrevious || sortedWeeks.length === 0) return;

    const firstWeek = sortedWeeks[0];
    const firstWeekDate = parseISO(`${firstWeek}T12:00:00`);
    const from = format(startOfWeek(addWeeks(firstWeekDate, -2), WEEK_OPTS), "yyyy-MM-dd");
    const to = format(endOfWeek(addWeeks(firstWeekDate, -1), WEEK_OPTS), "yyyy-MM-dd");

    setLoadingPrevious(true);
    try {
      const res = await fetch(
        `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (res.ok) {
        const next: CalendarRangeData = await res.json();
        pendingScrollRestoreRef.current = {
          prevScrollHeight: document.documentElement.scrollHeight,
          prevScrollTop: window.scrollY,
        };
        setData((prev) => mergeRangeData(prev, next));
      }
    } finally {
      setLoadingPrevious(false);
    }
  }, [canLoadPrevious, loadingPrevious, sortedWeeks]);

  useEffect(() => {
    const el = loadSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMoreWeeks();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreWeeks, sortedWeeks.length]);

  useEffect(() => {
    const el = loadPreviousSentinelRef.current;
    if (!el || !canLoadPrevious) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!canLoadPreviousRef.current) return;
        if (entries[0]?.isIntersecting) void loadPreviousWeeks();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadPrevious, loadPreviousWeeks, sortedWeeks.length]);

  useEffect(() => {
    const updateFocusedWeekFromScroll = () => {
      if (Date.now() < focusLockUntilRef.current) return;

      const weekTops: { weekStart: string; top: number }[] = [];
      for (const weekStart of sortedWeeks) {
        const el = document.querySelector(`[data-week-start="${weekStart}"]`);
        if (!(el instanceof HTMLElement)) continue;
        weekTops.push({ weekStart, top: el.getBoundingClientRect().top });
      }

      const bestWeek = pickFirstFullyVisibleWeek(weekTops, stickyOffsetPxRef.current);
      if (bestWeek) {
        setFocusedWeek(bestWeek);
      }
    };

    updateFocusedWeekFromScroll();
    window.addEventListener("scroll", updateFocusedWeekFromScroll, { passive: true });
    window.addEventListener("resize", updateFocusedWeekFromScroll);
    return () => {
      window.removeEventListener("scroll", updateFocusedWeekFromScroll);
      window.removeEventListener("resize", updateFocusedWeekFromScroll);
    };
  }, [setFocusedWeek, sortedWeeks, stickyOffsetPx]);

  async function openApplyDialog() {
    setApplyWeekStart(currentWeekStart);
    const res = await fetch(
      `/api/plan/calendar/template/apply?weekStart=${encodeURIComponent(currentWeekStart)}`
    );
    const json = res.ok ? await res.json() : { hasSessions: false };
    setApplyHasSessions(!!json.hasSessions);
    setApplyOpen(true);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    setActivePoolCard(null);
    const { active, over } = event;
    if (!over) return;

    if (
      isPoolPlacementDragId(active.id) &&
      !poolAllowsOver(over.data.current as Record<string, unknown> | undefined)
    ) {
      if (isAssembledWorkoutDrag(active.id)) {
        alert("Drop onto a session in the highlighted pool week only.");
      }
      return;
    }

    if (await poolComposer.handleDragEnd(event)) return;
    if (await workoutBuilder.handleDragEnd(event)) return;

    if (active.data.current?.type === "pool-session-card") {
      const chip = active.data.current.chip as UnscheduledChip;
      let draft: PoolCardDraft | null =
        (active.data.current.draft as PoolCardDraft | null) ??
        poolDrafts[chip.id] ??
        null;
      if (selectedPoolCardId === chip.id && builderExpanded) {
        draft = draftFromNodes(poolComposer.workoutTree.nodes, poolComposer.discipline);
      }
      await handlePoolSessionCardDrop(chip, draft, over.data.current);
      return;
    }

    if (active.data.current?.type === "pool-library-template") {
      await handleLibraryPoolDrop(
        active.data.current.template as PoolLibraryTemplate,
        over.data.current
      );
      return;
    }

    if (active.data.current?.type === "activity") {
      const activityId = parseActivityDragId(active.id);
      const sessionId =
        parseSessionLinkDropId(over.id) ??
        (over.data.current?.type === "session-link"
          ? (over.data.current.sessionId as string)
          : null);
      if (!activityId || !sessionId) return;
      await handleLinkActivity(sessionId, activityId);
      return;
    }

    if (active.data.current?.type !== "session") return;

    const session = active.data.current.session as CalendarPlannedSession;
    const targetDate = over.data.current?.dateKey as string | undefined;
    if (!targetDate || targetDate === session.scheduledDate) return;

    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === session.id
          ? { ...s, scheduledDate: targetDate, linkedActivity: null }
          : s
      ),
    }));

    try {
      const res = await fetch(`/api/plan/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: targetDate }),
      });
      if (!res.ok) throw new Error("Move failed");
      router.refresh();
    } catch {
      router.refresh();
    }
  }

  async function attachStepsToSession(
    sessionId: string,
    nodes: PoolCardDraft["nodes"]
  ): Promise<boolean> {
    const res = await fetch(`/api/plan/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: { version: WORKOUT_TREE_VERSION, nodes },
      }),
    });
    return res.ok;
  }

  async function createUnscheduledSession(
    dateKey: string,
    chip: UnscheduledChip,
    sessionRole: SessionRole,
    options?: {
      estimatedDurationMinutes?: number;
      distanceMeters?: number;
      targetPaceSeconds?: number;
      targetSpeedMps?: number;
    }
  ): Promise<string | null> {
    const dropWeekStart = format(
      startOfWeek(parseISO(`${dateKey}T12:00:00`), WEEK_OPTS),
      "yyyy-MM-dd"
    );
    const weekTarget = targetsByWeek.get(dropWeekStart);
    const weekSessions = sessionsForWeek(dropWeekStart);
    const unscheduledCount = weekTarget
      ? computeUnscheduledChips(dropWeekStart, weekTarget, weekSessions).filter(
          (c) => c.discipline === chip.discipline
        ).length
      : 1;

    const estimatedDurationMinutes =
      options?.estimatedDurationMinutes ??
      (chip.targetDurationMinutes != null && chip.targetDurationMinutes > 0
        ? chip.targetDurationMinutes
        : undefined);

    const targetZones =
      weekTarget && chip.discipline !== "STRENGTH"
        ? inheritTargetZonesFromRole({
            sessionRole,
            discipline: chip.discipline as Discipline,
            weekTarget,
            sessions: weekSessions,
            unscheduledCount: Math.max(1, unscheduledCount),
            targetDurationMinutes: estimatedDurationMinutes,
          })
        : undefined;

    const res = await fetch(`/api/plan/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledDate: dateKey,
        discipline: chip.discipline,
        title: unscheduledSessionTitle(chip.discipline),
        sessionRole,
        poolSlotKind: chip.slotKind,
        ...(estimatedDurationMinutes != null && estimatedDurationMinutes > 0
          ? { estimatedDurationMinutes }
          : {}),
        ...(options?.distanceMeters != null && options.distanceMeters > 0
          ? { distanceMeters: options.distanceMeters }
          : {}),
        ...(options?.targetPaceSeconds != null && options.targetPaceSeconds > 0
          ? { targetPaceSeconds: options.targetPaceSeconds }
          : {}),
        ...(options?.targetSpeedMps != null && options.targetSpeedMps > 0
          ? { targetSpeedMps: options.targetSpeedMps }
          : {}),
        ...(targetZones ? { targetZones } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { session?: { id?: string } };
    return data.session?.id ?? null;
  }

  async function handlePoolSessionCardDrop(
    chip: UnscheduledChip,
    draft: PoolCardDraft | null,
    overData: Record<string, unknown> | undefined
  ) {
    if (overData?.type !== "day") return;
    const dateKey = overData?.dateKey as string | undefined;
    if (!poolWeekAllowsDate(dateKey)) return;

    const sessionRole = sessionRoleForChip(chip);
    const estimatedDurationMinutes =
      draft && draft.durationMinutes > 0
        ? draft.durationMinutes
        : chip.targetDurationMinutes;

    const sessionId = await createUnscheduledSession(dateKey!, chip, sessionRole, {
      estimatedDurationMinutes:
        estimatedDurationMinutes != null && estimatedDurationMinutes > 0
          ? estimatedDurationMinutes
          : undefined,
      distanceMeters: draft?.distanceMeters,
      targetPaceSeconds: draft?.targetPaceSeconds,
      targetSpeedMps: draft?.targetSpeedMps,
    });
    if (!sessionId) {
      alert("Could not create session");
      return;
    }

    if (draft && draft.nodes.length > 0) {
      const ok = await attachStepsToSession(sessionId, draft.nodes);
      if (!ok) {
        alert("Session created but workout steps could not be attached");
      }
    }

    setPoolDrafts((prev) => {
      if (!(chip.id in prev)) return prev;
      const next = { ...prev };
      delete next[chip.id];
      return next;
    });
    if (selectedPoolCardId === chip.id) {
      setSelectedPoolCardId(null);
      setBuilderExpanded(false);
      poolComposer.clear();
    }
    await handleRefresh();
  }

  async function confirmRolePick(sessionRole: SessionRole) {
    if (!pendingRolePick) return;
    const { chip, dateKey } = pendingRolePick;
    setPendingRolePick(null);
    const id = await createUnscheduledSession(dateKey, chip, sessionRole);
    if (id) await handleRefresh();
  }

  async function applyTemplateToSession(sessionId: string, templateId: string): Promise<boolean> {
    const res = await fetch(`/api/plan/sessions/${sessionId}/apply-workout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutTemplateId: templateId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      alert(data.error ?? "Could not apply workout");
      return false;
    }
    return true;
  }

  async function createSessionWithTemplate(
    dateKey: string,
    template: PoolLibraryTemplate,
    chip?: UnscheduledChip
  ) {
    const res = await fetch(`/api/plan/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledDate: dateKey,
        discipline: template.discipline,
        title: template.name,
        ...(chip
          ? {
              sessionRole: sessionRoleForChip(chip),
              poolSlotKind: chip.slotKind,
              ...(chip.targetDurationMinutes != null && chip.targetDurationMinutes > 0
                ? { estimatedDurationMinutes: chip.targetDurationMinutes }
                : {}),
            }
          : {}),
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { session?: { id?: string } };
    const id = data.session?.id;
    if (!id) return false;
    return applyTemplateToSession(id, template.templateId);
  }

  async function handleLibraryPoolDrop(
    template: PoolLibraryTemplate,
    overData: Record<string, unknown> | undefined
  ) {
    const overType = overData?.type;
    if (overType === "session-workout") {
      if (overData?.source === "RACE") {
        alert("Cannot apply workout to a race session");
        return;
      }
      const sessionDiscipline = overData?.discipline as string | undefined;
      if (sessionDiscipline && sessionDiscipline !== template.discipline) {
        alert("Workout discipline does not match session");
        return;
      }
      const sessionId = overData?.sessionId as string | undefined;
      if (!sessionId) return;
      if (overData?.hasStructuredWorkout && sessionId !== boundApplySessionId) {
        alert("Remove the existing workout before applying a new one, or Edit that session.");
        return;
      }
      const ok = await applyTemplateToSession(sessionId, template.templateId);
      if (ok) await handleRefresh();
      return;
    }
    if (overType === "day") {
      const dateKey = overData?.dateKey as string | undefined;
      if (!poolWeekAllowsDate(dateKey)) return;
      const ok = await createSessionWithTemplate(dateKey!, template);
      if (ok) await handleRefresh();
    }
  }

  const reloadCalendarData = useCallback(
    async (weekStartsOverride?: string[]) => {
      const weeks = [...(weekStartsOverride ?? data.weekStarts)].sort();
      if (weeks.length === 0) {
        router.refresh();
        return;
      }
      const from = weeks[0];
      const to = format(
        endOfWeek(parseISO(`${weeks[weeks.length - 1]}T12:00:00`), WEEK_OPTS),
        "yyyy-MM-dd"
      );
      const res = await fetch(
        `/api/plan/calendar/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (res.ok) {
        const next: CalendarRangeData = await res.json();
        setData(next);
      }
      router.refresh();
    },
    [data.weekStarts, router]
  );

  function toLinkedActivity(
    activity: CalendarWeekActivity
  ): NonNullable<CalendarPlannedSession["linkedActivity"]> {
    return {
      id: activity.id,
      name: activity.name,
      startTime: activity.startTime,
      durationSeconds: activity.durationSeconds,
      elapsedSeconds: activity.durationSeconds,
      movingSeconds: null,
      distanceMeters: activity.distanceMeters,
      zoneMinutes: totalZoneMinutes(activity.zoneMinutes),
      discipline: activity.discipline,
      legType: activity.legType,
    };
  }

  async function handleLinkActivity(sessionId: string, activityId: string) {
    const activity = data.activities.find((a) => a.id === activityId);
    if (!activity) {
      await reloadCalendarData();
      return;
    }

    const linked = toLinkedActivity(activity);
    setData((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id === sessionId) {
          return { ...s, linkedActivity: linked };
        }
        if (s.linkedActivity?.id === activityId) {
          return { ...s, linkedActivity: null };
        }
        return s;
      }),
    }));

    try {
      const res = await fetch(`/api/plan/sessions/${sessionId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(typeof json.error === "string" ? json.error : "Could not link workout");
        await reloadCalendarData();
        return;
      }
      router.refresh();
    } catch {
      await reloadCalendarData();
    }
  }

  async function handleRefresh() {
    await reloadCalendarData();
  }

  function handleTemplateApplied(appliedWeekStart: string) {
    const appliedWeek = format(
      startOfWeek(parseISO(`${appliedWeekStart}T12:00:00`), WEEK_OPTS),
      "yyyy-MM-dd"
    );
    const weeks = new Set([...data.weekStarts, appliedWeek]);
    void reloadCalendarData([...weeks].sort());
  }

  function scrollToToday() {
    setCalendarOpen(false);
    if (poolOpen) {
      handlePoolWeekChange(currentWeekStart);
    } else {
      void scrollToWeekAsync(currentWeekStart);
    }
  }

  async function handleUnassignWorkout(session: CalendarPlannedSession) {
    const res = await fetch(`/api/plan/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: { version: WORKOUT_TREE_VERSION, nodes: [] },
      }),
    });
    if (!res.ok) {
      alert("Could not remove workout");
      return;
    }
    await handleRefresh();
  }

  const poolWizardProps: WorkoutPoolWizardProps = {
    poolWeekStart,
    onPoolWeekChange: handlePoolWeekChange,
    weekTarget: poolWeekTarget,
    sessions: poolWeekSessions,
    activities: poolWeekActivities,
    currentWeekStart,
    drafts: poolDrafts,
    disciplineFilter: poolDisciplineFilter,
    onDisciplineFilterChange: setPoolDisciplineFilter,
    selectedCardId: selectedPoolCardId,
    onSelectCard: handleSelectPoolCard,
    builderExpanded,
    onBuilderExpandedChange: setBuilderExpanded,
    onBuilderDone: handleBuilderDone,
    composer: poolComposer,
    disciplineSettings,
    onAutoFillEasyTiz: handleAutoFillEasyTiz,
    onApplyToSession: () => void handleApplyToBuildTarget(),
    applyTargetHasExistingWorkout: Boolean(
      boundApplySessionId &&
        data.sessions.some((s) => s.id === boundApplySessionId && s.stepCount > 0)
    ),
    paceContext,
  };

  const calendarWeeksContent = (
    <>
      <div className="space-y-8">
        <div
          ref={loadPreviousSentinelRef}
          className="py-2 text-center text-sm text-zinc-500"
        >
          {canLoadPrevious
            ? loadingPrevious
              ? "Loading previous weeks…"
              : "Scroll up for previous weeks"
            : null}
        </div>
        {sortedWeeks.map((weekStart) => (
          <CalendarWeekRow
            key={weekStart}
            weekStart={weekStart}
            currentWeekStart={currentWeekStart}
            sessions={sessionsForWeek(weekStart)}
            activities={activitiesForWeek(weekStart)}
            weekTarget={targetsByWeek.get(weekStart) ?? null}
            disciplineSettings={disciplineSettings}
            workoutShadingSettings={workoutShadingSettings}
            workoutShadingTarget={workoutShadingTarget}
            ecoLoadEnabled={ecoLoadEnabled}
            onSessionCreated={handleRefresh}
            activeDragId={activeDragId}
            isCurrentWeek={weekStart === currentWeekStart}
            isFocusedWeek={weekStart === focusedWeekStart}
            isPoolWeek={useWizardPool && weekStart === poolWeekStart}
            showPool={poolOpen && !useWizardPool && weekStart === focusedWeekStart}
            useWizardPool={useWizardPool}
            acceptsPoolDrop={!useWizardPool || weekStart === poolWeekStart}
            selectedDateKey={
              useWizardPool
                ? weekStart === poolWeekStart
                  ? selectedDateKey
                  : null
                : weekStart === focusedWeekStart
                  ? selectedDateKey
                  : null
            }
            onSelectDay={(dateKey) => {
              setFocusedWeek(weekStart, { lockMs: 800 });
              setSelectedDateKey(dateKey);
              if (!poolOpen) setPoolOpen(true);
            }}
            onClearSelection={() => setSelectedDateKey(null)}
            poolDrafts={poolDrafts}
            poolDisciplineFilter={poolDisciplineFilter}
            onPoolDisciplineFilterChange={setPoolDisciplineFilter}
            selectedPoolCardId={selectedPoolCardId}
            onSelectPoolCard={handleSelectPoolCard}
            onEditWorkout={
              useWizardPool ? (session) => void handleEditWorkout(session) : undefined
            }
            onDuplicateWorkout={
              useWizardPool ? (session) => void handleDuplicateWorkout(session) : undefined
            }
            onArmBuildFromSession={
              useWizardPool ? (session) => handleArmBuildFromSession(session) : undefined
            }
            onUnassignWorkout={
              useWizardPool ? (session) => void handleUnassignWorkout(session) : undefined
            }
            onAutoFillEasyTiz={() => void handleAutoFillEasyTizForWeek(weekStart)}
            paceContext={paceContext}
            scrollMarginTopPx={stickyOffsetPx}
          />
        ))}
      </div>

      <div ref={loadSentinelRef} className="py-4 text-center text-sm text-zinc-500">
        {loadingMore ? "Loading more weeks…" : "Scroll down for more weeks"}
      </div>
    </>
  );

  return (
    <DndContext
      sensors={sensors}
      autoScroll={{
        canScroll: (element) => {
          // Keep pool pane from stealing scroll while dragging onto the calendar.
          if (
            element instanceof HTMLElement &&
            element.dataset.workoutPoolScroll === "true"
          ) {
            return false;
          }
          return true;
        },
      }}
      onDragStart={(e) => {
        setActiveDragId(String(e.active.id));
        if (e.active.data.current?.type === "pool-session-card") {
          setActivePoolCard(e.active.data.current.chip as PoolSessionCard);
        } else {
          setActivePoolCard(null);
        }
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDragId(null);
        setActivePoolCard(null);
      }}
    >
      <div className="w-full space-y-4">
        <div className="sticky top-0 z-30 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex items-center justify-between gap-3 overflow-x-auto">
            <div className="flex shrink-0 gap-2">
              <WorkoutUploadButton onUploaded={() => void handleRefresh()} />
              <Button type="button" onClick={() => void openApplyDialog()}>
                Apply template
              </Button>
              <Link href="/calendar/template">
                <Button type="button" variant="secondary">
                  Edit weekly template
                </Button>
              </Link>
              {!useWizardPool ? (
                <Button
                  type="button"
                  variant={workoutBuilder.open ? "primary" : "secondary"}
                  onClick={() => workoutBuilder.setOpen((v) => !v)}
                >
                  Workout builder
                </Button>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant={poolOpen ? "primary" : "secondary"}
                onClick={() => setPoolOpen((open) => !open)}
              >
                {poolOpen ? "Hide pool" : "Workout pool"}
              </Button>
              <Button type="button" variant="secondary" onClick={scrollToToday}>
                Today
              </Button>
              {poolOpen ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void goToNextUnplannedWeek()}
                >
                  Next unplanned week
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCalendarOpen((open) => !open)}
              >
                {calendarOpen ? "Hide calendar" : "Jump to week"}
              </Button>
            </div>
          </div>

          {workoutBuilder.open && !useWizardPool ? (
            <WorkoutBuilderPane
              builder={workoutBuilder}
              onClose={() => workoutBuilder.setOpen(false)}
            />
          ) : null}

          {calendarOpen && (
            <div className="mt-3 max-h-[min(70vh,32rem)] overflow-y-auto border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <p className="mb-3 text-xs text-zinc-500">
                Pick any day to jump to that week (Mon–Sun). Click the month or year header to zoom
                out to months or years.
              </p>
              <div className="mx-auto w-full max-w-sm">
                <DayCalendarPicker
                  selectedDate={currentWeekStart}
                  onSelect={(date) => {
                    setCalendarOpen(false);
                    const weekStart = format(
                      startOfWeek(parseISO(`${date}T12:00:00`), WEEK_OPTS),
                      "yyyy-MM-dd"
                    );
                    void scrollToWeekAsync(weekStart);
                  }}
                  flaggableDates={activityDates}
                  minDate={null}
                  maxDate={null}
                  highlightWeekStart={currentWeekStart}
                />
              </div>
            </div>
          )}
        </div>

        {useWizardPool && poolOpen ? (
          <div className="xl:flex xl:items-start xl:gap-4">
            <aside className="mb-4 w-full min-w-0 shrink-0 overflow-x-hidden xl:sticky xl:top-[4.5rem] xl:mb-0 xl:h-[calc(100vh-4.5rem)] xl:w-72">
              <WorkoutPoolWizardSideColumn {...poolWizardProps} />
            </aside>
            <div className="min-w-0 flex-1 space-y-4">
              <div
                ref={editorBandRef}
                className="scroll-mt-[4.5rem] bg-white dark:bg-black xl:sticky xl:top-[4.5rem] xl:z-20 xl:max-h-[calc(100vh-4.5rem)] xl:overflow-y-auto"
              >
                <WorkoutPoolWizardBand {...poolWizardProps} />
              </div>
              {calendarWeeksContent}
            </div>
          </div>
        ) : (
          calendarWeeksContent
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeSession ? (
          <CalendarSessionCard
            session={activeSession}
            workoutShadingSettings={workoutShadingSettings}
            workoutShadingTarget={workoutShadingTarget}
            disciplineSettings={disciplineSettings}
            isDragging
          />
        ) : null}
        {activeActivity ? (
          <DraggableActivityCard
            activity={activeActivity}
            disciplineSettings={disciplineSettings}
            isDragging
          />
        ) : null}
        {activePoolCard ? (
          <PoolSessionCardPreview card={activePoolCard} selected />
        ) : null}
      </DragOverlay>

      <ApplyTemplateDialog
        open={applyOpen}
        defaultWeekStart={applyWeekStart}
        hasExistingSessions={applyHasSessions}
        onClose={() => setApplyOpen(false)}
        onApplied={handleTemplateApplied}
      />

      <SessionRolePickerDialog
        open={pendingRolePick != null}
        disciplineLabel={
          pendingRolePick
            ? (DISCIPLINE_DISPLAY_LABELS[pendingRolePick.chip.discipline] ??
              pendingRolePick.chip.discipline)
            : ""
        }
        dateKey={pendingRolePick?.dateKey ?? ""}
        onCancel={() => setPendingRolePick(null)}
        onConfirm={(role) => void confirmRolePick(role)}
      />
    </DndContext>
  );
}

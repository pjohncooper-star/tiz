"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDisciplineSettings } from "@/lib/units/use-discipline-settings";
import {
  disciplineFocusesForPhase,
  emptyGoalEventDraft,
  goalEventFromApi,
  isGoalEventComplete,
  isGoalEventPartial,
  isGoalEventTimesPartial,
  normalizePhasesFromApi,
  phasesForApi,
  type GoalEventDraft,
  type PhaseDraft,
  type PhaseFocus,
  type SeasonData,
  type Discipline,
  type UnlinkedRaceSession,
} from "@/components/season/season-settings-types";
import {
  allPhaseMesocyclesValid,
  defaultMesocycleDrafts,
  mesocycleRoman,
  mesocycleWeekTotal,
  nextMesocycleName,
  type MesocycleDraft,
} from "@/lib/plan/season/mesocycle-draft";
import { markDeLoadWeeksPerMesocycle } from "@/lib/plan/season/de-load-cadence";
import {
  defaultPhaseForKind,
  phaseWeekTotal as sumPhaseWeeks,
  suggestPhasesForWeeks,
} from "@/lib/plan/season/default-phases";
import { fitPhasesToTotalWeeks } from "@/lib/plan/season/phase-week-fit";
import { goalEventTimesForApi } from "@/lib/plan/season/goal-event-times";
import {
  defaultLongWeekFlags,
  type LongWeekPreset,
} from "@/lib/plan/season/long-session-schedule";
import { resizePhaseBoundaryAtWeek } from "@/lib/plan/season/phase-boundary-resize";
import { resolveMesocycles } from "@/lib/plan/season/phase-split";
import { resolvePhaseTargets } from "@/lib/plan/season/phase-volume-ramp";
import {
  resolveDisciplineTargets,
  type DisciplineKey,
} from "@/lib/plan/season/discipline-volume-ramp";
import { buildSeasonDateBounds } from "@/lib/plan/season/season-dates";
import type { SeasonPhaseInput } from "@/lib/plan/season/types";
import { parseDateKey } from "@/lib/dates";
import type { PhaseKind } from "@prisma/client";

type UseSeasonSettingsOptions = {
  seasonIdParam?: string | null;
  /** Wizard: redirect to /plan if setup already complete. Edit: always load. */
  mode: "wizard" | "edit";
};

function phasesToSeasonInput(phases: PhaseDraft[]): SeasonPhaseInput[] {
  return phases.map((phase) => ({
    id: phase.id,
    name: phase.name,
    sortOrder: phase.sortOrder,
    weekCount: phase.weekCount,
    phaseKind: phase.phaseKind,
    color: phase.color,
    focusMode: phase.focusMode,
    phaseFocus: phase.phaseFocus,
    disciplineFocuses: phase.disciplineFocuses,
    mesocycles: phase.mesocycles?.map((m) => ({
      id: m.id,
      name: m.name,
      weekCount: m.weekCount,
      swimSplitPercent: m.swimSplitPercent,
      bikeSplitPercent: m.bikeSplitPercent,
      runSplitPercent: m.runSplitPercent,
    })),
    swimSessionsPerWeek: phase.swimSessionsPerWeek,
    bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
    runSessionsPerWeek: phase.runSessionsPerWeek,
    volumeMesocycleMode: phase.volumeMesocycleMode,
    volumeStartHours: phase.volumeStartHours,
    volumeEndHours: phase.volumeEndHours,
    volumeRampPercent: phase.volumeRampPercent,
    swimStartHours: phase.swimStartHours,
    swimEndHours: phase.swimEndHours,
    swimRampPercent: phase.swimRampPercent,
    bikeStartHours: phase.bikeStartHours,
    bikeEndHours: phase.bikeEndHours,
    bikeRampPercent: phase.bikeRampPercent,
    runStartHours: phase.runStartHours,
    runEndHours: phase.runEndHours,
    runRampPercent: phase.runRampPercent,
    longRideStartMin: phase.longRideStartMin,
    longRideEndMin: phase.longRideEndMin,
    longRunStartMin: phase.longRunStartMin,
    longRunEndMin: phase.longRunEndMin,
  }));
}

function defaultDeLoadFlags(
  phases: PhaseDraft[],
  mesocycleLengthWeeks: number,
  totalWeeks: number,
  everyNWeeks: number
): boolean[] {
  const weeks = Math.max(totalWeeks, 1);
  const mesocycles = resolveMesocycles(phasesToSeasonInput(phases), mesocycleLengthWeeks);
  return markDeLoadWeeksPerMesocycle({
    mesocycles,
    totalWeeks: weeks,
    everyNWeeks,
  });
}

function resizeWeekFlags(flags: boolean[], totalWeeks: number): boolean[] {
  const next = [...flags];
  while (next.length < totalWeeks) next.push(false);
  return next.slice(0, Math.max(totalWeeks, 0));
}

function fitPhaseDraftsToTotalWeeks(
  phases: PhaseDraft[],
  targetWeeks: number,
  mesocycleLengthWeeks: number
): PhaseDraft[] {
  if (targetWeeks <= 0) return phases;
  if (phases.length === 0) {
    return suggestedPhaseDrafts(targetWeeks, mesocycleLengthWeeks);
  }

  const fitted = fitPhasesToTotalWeeks(
    phasesToSeasonInput(phases),
    targetWeeks,
    mesocycleLengthWeeks
  );
  const prevById = new Map(phases.filter((p) => p.id).map((p) => [p.id!, p] as const));

  return fitted.map((phase) => {
    const prev = phase.id ? prevById.get(phase.id) : undefined;
    if (!prev) {
      return {
        name: phase.name,
        sortOrder: phase.sortOrder,
        weekCount: phase.weekCount,
        phaseKind: phase.phaseKind,
        color: phase.color ?? "#38bdf8",
        focusMode: phase.focusMode,
        phaseFocus: phase.phaseFocus ?? null,
        swimSessionsPerWeek: phase.swimSessionsPerWeek,
        bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
        runSessionsPerWeek: phase.runSessionsPerWeek,
        mesocycles: defaultMesocycleDrafts(
          phase.name,
          phase.weekCount,
          mesocycleLengthWeeks
        ),
      };
    }
    const weekCountChanged = prev.weekCount !== phase.weekCount;
    return {
      ...prev,
      sortOrder: phase.sortOrder,
      weekCount: phase.weekCount,
      name: phase.name,
      mesocycles: weekCountChanged
        ? defaultMesocycleDrafts(phase.name, phase.weekCount, mesocycleLengthWeeks)
        : prev.mesocycles,
    };
  });
}

function suggestedPhaseDrafts(
  totalWeeks: number,
  mesocycleLengthWeeks: number
): PhaseDraft[] {
  if (totalWeeks <= 0) return [];
  return suggestPhasesForWeeks(totalWeeks).map((phase, i) => ({
    name: phase.name,
    sortOrder: i,
    weekCount: phase.weekCount,
    phaseKind: phase.phaseKind,
    color: phase.color ?? "#38bdf8",
    focusMode: phase.focusMode,
    phaseFocus: phase.phaseFocus ?? null,
    swimSessionsPerWeek: phase.swimSessionsPerWeek,
    bikeSessionsPerWeek: phase.bikeSessionsPerWeek,
    runSessionsPerWeek: phase.runSessionsPerWeek,
    mesocycles: defaultMesocycleDrafts(phase.name, phase.weekCount, mesocycleLengthWeeks),
  }));
}

function flagsFromSeason(season: SeasonData): boolean[] | null {
  if (season.deLoadWeekFlags?.length === season.totalWeeks) {
    return season.deLoadWeekFlags;
  }
  if (season.weeks?.length === season.totalWeeks) {
    return [...season.weeks]
      .sort((a, b) => a.weekIndex - b.weekIndex)
      .map((w) => w.isDeLoadWeek);
  }
  return null;
}

function phaseKindsFromPhases(phases: PhaseDraft[], totalWeeks: number): PhaseKind[] {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const kinds: PhaseKind[] = [];
  for (const phase of sorted) {
    for (let w = 0; w < phase.weekCount; w++) {
      kinds.push(phase.phaseKind);
    }
  }
  while (kinds.length < totalWeeks) {
    kinds.push(sorted[sorted.length - 1]?.phaseKind ?? "BUILD");
  }
  return kinds.slice(0, totalWeeks);
}

function defaultLongFlagsForPlan(
  phases: PhaseDraft[],
  mesocycleLengthWeeks: number,
  totalWeeks: number,
  deLoadWeekFlags: boolean[],
  preset?: LongWeekPreset
): boolean[] {
  const weeks = Math.max(totalWeeks, 1);
  const mesocycles = resolveMesocycles(phasesToSeasonInput(phases), mesocycleLengthWeeks);
  const deLoadFlags = [...deLoadWeekFlags];
  while (deLoadFlags.length < weeks) deLoadFlags.push(false);
  return defaultLongWeekFlags({
    totalWeeks: weeks,
    phaseKindsByWeek: phaseKindsFromPhases(phases, weeks),
    mesocycles,
    deLoadFlags: deLoadFlags.slice(0, weeks),
    preset,
  });
}

function goalEventPayload(race: GoalEventDraft) {
  const times = goalEventTimesForApi({
    disciplines: race.disciplines,
    estimatedDurationMinutes: race.estimatedDurationMinutes ?? null,
    swimGoalMinutes: race.swimGoalMinutes ?? null,
    bikeGoalMinutes: race.bikeGoalMinutes ?? null,
    runGoalMinutes: race.runGoalMinutes ?? null,
  });
  return {
    id: race.id,
    name: race.name.trim(),
    date: race.date,
    disciplines: race.disciplines,
    distanceMeters: race.distanceMeters ?? null,
    estimatedDurationMinutes: times.estimatedDurationMinutes,
    swimGoalMinutes: times.swimGoalMinutes,
    bikeGoalMinutes: times.bikeGoalMinutes,
    runGoalMinutes: times.runGoalMinutes,
    taperDaysBefore: race.taperDaysBefore ?? null,
    notes: race.notes ?? null,
  };
}

export function useSeasonSettings({ seasonIdParam, mode }: UseSeasonSettingsOptions) {
  const router = useRouter();
  const { disciplineSettings } = useDisciplineSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(seasonIdParam ?? null);

  const [name, setName] = useState("2026 Season");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [aRace, setARace] = useState<GoalEventDraft>(emptyGoalEventDraft());
  const [bRaces, setBRaces] = useState<GoalEventDraft[]>([]);
  const [cRaces, setCRaces] = useState<GoalEventDraft[]>([]);
  const [unlinkedCalendarRaces, setUnlinkedCalendarRaces] = useState<UnlinkedRaceSession[]>(
    []
  );
  const [pendingRemovals, setPendingRemovals] = useState<
    { id: string; deleteFromCalendar: boolean }[]
  >([]);

  const [mesocycleLengthWeeks, setMesocycleLengthWeeks] = useState(4);
  const [phases, setPhases] = useState<PhaseDraft[]>([]);
  const [totalWeeks, setTotalWeeks] = useState(0);
  const [phasesAutoAdjusted, setPhasesAutoAdjusted] = useState(false);

  const [startHours, setStartHours] = useState(8);
  const [peakHours, setPeakHours] = useState(12);
  const [swimSplitPercent, setSwimSplitPercent] = useState<number | null>(null);
  const [bikeSplitPercent, setBikeSplitPercent] = useState<number | null>(null);
  const [runSplitPercent, setRunSplitPercent] = useState<number | null>(null);
  const [maxRampPercent, setMaxRampPercent] = useState(10);
  const [longRideStartMin, setLongRideStartMin] = useState(60);
  const [longRidePeakMin, setLongRidePeakMin] = useState(180);
  const [longRunStartMin, setLongRunStartMin] = useState(30);
  const [longRunPeakMin, setLongRunPeakMin] = useState(90);

  const [deLoadEveryNWeeks, setDeLoadEveryNWeeks] = useState(4);
  const [deLoadVolumePercent, setDeLoadVolumePercent] = useState(60);
  const [deLoadStrategy, setDeLoadStrategy] = useState<
    "VOLUME_ONLY" | "VOLUME_AND_INTENSITY" | "SINGLE_SPORT_FOCUS"
  >("VOLUME_ONLY");
  const [reduceCountsOnDeLoad, setReduceCountsOnDeLoad] = useState(true);
  const [deLoadWeekFlags, setDeLoadWeekFlags] = useState<boolean[]>([]);
  const [longRideWeekFlags, setLongRideWeekFlags] = useState<boolean[]>([]);
  const [longRunWeekFlags, setLongRunWeekFlags] = useState<boolean[]>([]);

  const hydrateFromSeason = useCallback((season: SeasonData) => {
    setName(season.name);
    setStartDate(season.startDate);
    setEndDate(season.endDate);
    setMesocycleLengthWeeks(season.mesocycleLengthWeeks);
    setTotalWeeks(season.totalWeeks);
    const phasesNormalized = normalizePhasesFromApi(season.phases, season.mesocycleLengthWeeks);
    setPhases(phasesNormalized);
    setStartHours(season.startHours);
    setPeakHours(season.peakHours);
    setSwimSplitPercent(season.swimSplitPercent ?? null);
    setBikeSplitPercent(season.bikeSplitPercent ?? null);
    setRunSplitPercent(season.runSplitPercent ?? null);
    setMaxRampPercent(season.maxRampPercent);
    setLongRideStartMin(season.longRideStartMin);
    setLongRidePeakMin(season.longRidePeakMin);
    setLongRunStartMin(season.longRunStartMin);
    setLongRunPeakMin(season.longRunPeakMin);
    setDeLoadEveryNWeeks(season.deLoadEveryNWeeks);
    setDeLoadVolumePercent(season.deLoadVolumePercent);
    setDeLoadStrategy(season.deLoadStrategy as typeof deLoadStrategy);
    setReduceCountsOnDeLoad(season.reduceCountsOnDeLoad);
    const storedFlags = flagsFromSeason(season);
    const deLoadDefaults =
      storedFlags ??
      defaultDeLoadFlags(
        phasesNormalized,
        season.mesocycleLengthWeeks,
        season.totalWeeks,
        season.deLoadEveryNWeeks
      );
    setDeLoadWeekFlags(deLoadDefaults);
    setLongRideWeekFlags(
      season.longRideWeekFlags?.length === season.totalWeeks
        ? season.longRideWeekFlags
        : defaultLongFlagsForPlan(
            phasesNormalized,
            season.mesocycleLengthWeeks,
            season.totalWeeks,
            deLoadDefaults
          )
    );
    setLongRunWeekFlags(
      season.longRunWeekFlags?.length === season.totalWeeks
        ? season.longRunWeekFlags
        : defaultLongFlagsForPlan(
            phasesNormalized,
            season.mesocycleLengthWeeks,
            season.totalWeeks,
            deLoadDefaults
          )
    );
    if (season.primaryGoalEvent) {
      setARace(goalEventFromApi(season.primaryGoalEvent));
    } else {
      setARace(emptyGoalEventDraft());
    }
    const events = season.goalEvents ?? [];
    setBRaces(
      events.filter((e) => e.priority === "B").map((e) => goalEventFromApi(e))
    );
    setCRaces(
      events.filter((e) => e.priority === "C").map((e) => goalEventFromApi(e))
    );
    setUnlinkedCalendarRaces(season.unlinkedRaceSessions ?? []);
    setPendingRemovals([]);
    setPhasesAutoAdjusted(false);
  }, []);

  const loadSeason = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = seasonIdParam
      ? `/api/plan/season?seasonId=${encodeURIComponent(seasonIdParam)}`
      : "/api/plan/season";
    const res = await fetch(url);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { season: SeasonData | null };
    if (!data.season) {
      setLoading(false);
      return;
    }

    if (mode === "wizard" && data.season.setupComplete) {
      router.replace(seasonIdParam ? `/plan?seasonId=${seasonIdParam}` : "/plan");
      return;
    }

    hydrateFromSeason(data.season);
    setSeasonId(data.season.id);
    setLoading(false);
  }, [hydrateFromSeason, mode, router, seasonIdParam]);

  useEffect(() => {
    void loadSeason();
  }, [loadSeason]);

  const phaseWeekTotal = useMemo(
    () => phases.reduce((sum, p) => sum + p.weekCount, 0),
    [phases]
  );

  const applySeasonBoundsFromDates = useCallback(
    (nextStart: string, nextEnd: string) => {
      if (!nextStart || !nextEnd) return;
      const bounds = buildSeasonDateBounds(
        parseDateKey(nextStart),
        parseDateKey(nextEnd)
      );
      setTotalWeeks(bounds.totalWeeks);
      setPhases((prev) => {
        if (prev.length === 0) return prev;
        const sum = sumPhaseWeeks(prev);
        if (sum === bounds.totalWeeks) {
          setDeLoadWeekFlags((flags) => resizeWeekFlags(flags, bounds.totalWeeks));
          setLongRideWeekFlags((flags) => resizeWeekFlags(flags, bounds.totalWeeks));
          setLongRunWeekFlags((flags) => resizeWeekFlags(flags, bounds.totalWeeks));
          return prev;
        }
        const fitted = fitPhaseDraftsToTotalWeeks(
          prev,
          bounds.totalWeeks,
          mesocycleLengthWeeks
        );
        setPhasesAutoAdjusted(true);
        const deLoad = defaultDeLoadFlags(
          fitted,
          mesocycleLengthWeeks,
          bounds.totalWeeks,
          deLoadEveryNWeeks
        );
        setDeLoadWeekFlags(deLoad);
        setLongRideWeekFlags(
          defaultLongFlagsForPlan(
            fitted,
            mesocycleLengthWeeks,
            bounds.totalWeeks,
            deLoad
          )
        );
        setLongRunWeekFlags(
          defaultLongFlagsForPlan(
            fitted,
            mesocycleLengthWeeks,
            bounds.totalWeeks,
            deLoad
          )
        );
        return fitted;
      });
    },
    [deLoadEveryNWeeks, mesocycleLengthWeeks]
  );

  const changeStartDate = useCallback(
    (value: string) => {
      setStartDate(value);
      if (value && endDate) {
        applySeasonBoundsFromDates(value, endDate);
      }
    },
    [applySeasonBoundsFromDates, endDate]
  );

  const changeEndDate = useCallback(
    (value: string) => {
      setEndDate(value);
      if (startDate && value) {
        applySeasonBoundsFromDates(startDate, value);
      }
    },
    [applySeasonBoundsFromDates, startDate]
  );

  function updatePhase(index: number, patch: Partial<PhaseDraft>) {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        const next = { ...p, ...patch };
        if (patch.focusMode === "DISCIPLINE") {
          next.disciplineFocuses = disciplineFocusesForPhase(next);
        }
        if (patch.weekCount !== undefined && patch.weekCount !== p.weekCount) {
          next.mesocycles = defaultMesocycleDrafts(
            next.name,
            next.weekCount,
            mesocycleLengthWeeks
          );
        }
        if (patch.name !== undefined && patch.name !== p.name) {
          next.mesocycles = (next.mesocycles ?? []).map((m, mi) => ({
            ...m,
            name: `${next.name} ${mesocycleRoman(mi)}`,
          }));
        }
        return next;
      })
    );
  }

  function resizePhaseBoundary(boundaryIndex: number, boundaryWeekIndex: number) {
    setPhases((prev) => {
      const weekCounts = prev.map((phase) => phase.weekCount);
      const nextCounts = resizePhaseBoundaryAtWeek(
        weekCounts,
        boundaryIndex,
        boundaryWeekIndex
      );
      if (!nextCounts) return prev;
      return prev.map((phase, index) => {
        const nextWeekCount = nextCounts[index];
        if (nextWeekCount === phase.weekCount) return phase;
        return {
          ...phase,
          weekCount: nextWeekCount!,
          mesocycles: defaultMesocycleDrafts(
            phase.name,
            nextWeekCount!,
            mesocycleLengthWeeks
          ),
        };
      });
    });
  }

  function updateMesocycle(phaseIndex: number, mesoIndex: number, patch: Partial<MesocycleDraft>) {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIndex) return p;
        const mesocycles = [...(p.mesocycles ?? [])];
        const current = mesocycles[mesoIndex];
        if (!current) return p;
        mesocycles[mesoIndex] = { ...current, ...patch };
        return { ...p, mesocycles };
      })
    );
  }

  function addMesocycle(phaseIndex: number) {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIndex) return p;
        const mesocycles = [...(p.mesocycles ?? [])];
        mesocycles.push({
          name: nextMesocycleName(p.name, mesocycles),
          weekCount: 1,
        });
        return { ...p, mesocycles };
      })
    );
  }

  function removeMesocycle(phaseIndex: number, mesoIndex: number) {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIndex) return p;
        const mesocycles = [...(p.mesocycles ?? [])];
        if (mesocycles.length <= 1) return p;
        mesocycles.splice(mesoIndex, 1);
        return {
          ...p,
          mesocycles: mesocycles.map((m, idx) => ({
            ...m,
            name: `${p.name} ${mesocycleRoman(idx)}`,
          })),
        };
      })
    );
  }

  function autoSplitPhaseMesocycles(phaseIndex: number) {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIndex) return p;
        return {
          ...p,
          mesocycles: defaultMesocycleDrafts(p.name, p.weekCount, mesocycleLengthWeeks),
        };
      })
    );
  }

  function autoSplitAllMesocycles() {
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        mesocycles: defaultMesocycleDrafts(p.name, p.weekCount, mesocycleLengthWeeks),
      }))
    );
  }

  function updateDisciplineFocus(phaseIndex: number, discipline: Discipline, focus: PhaseFocus) {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIndex) return p;
        const focuses = disciplineFocusesForPhase(p).map((d) =>
          d.discipline === discipline ? { ...d, focus } : d
        );
        return { ...p, disciplineFocuses: focuses };
      })
    );
  }

  function addPhase() {
    setPhases((prev) => {
      const template = defaultPhaseForKind("BUILD", 4, prev.length);
      return [
        ...prev,
        {
          name: template.name,
          sortOrder: prev.length,
          weekCount: template.weekCount,
          phaseKind: template.phaseKind,
          color: template.color ?? "#6366f1",
          focusMode: template.focusMode,
          phaseFocus: template.phaseFocus ?? null,
          swimSessionsPerWeek: template.swimSessionsPerWeek,
          bikeSessionsPerWeek: template.bikeSessionsPerWeek,
          runSessionsPerWeek: template.runSessionsPerWeek,
          mesocycles: defaultMesocycleDrafts(
            template.name,
            template.weekCount,
            mesocycleLengthWeeks
          ),
        },
      ];
    });
  }

  async function removePhase(index: number) {
    if (phases.length <= 1) return;
    const phase = phases[index];
    if (!phase) return;

    let message = `Remove "${phase.name}"?`;
    if (phase.id && seasonId) {
      const res = await fetch(
        `/api/plan/anchors?seasonPlanId=${encodeURIComponent(seasonId)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          anchors: { seasonPhaseId: string | null }[];
        };
        const anchorCount = data.anchors.filter((a) => a.seasonPhaseId === phase.id).length;
        if (anchorCount > 0) {
          message = `Remove "${phase.name}" and delete ${anchorCount} anchor workout${anchorCount === 1 ? "" : "s"}?`;
        }
      }
    }
    if (!confirm(message)) return;

    setPhases((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((p, i) => ({ ...p, sortOrder: i }))
    );
    setDeLoadWeekFlags((prev) => {
      const nextPhases = phases.filter((_, i) => i !== index);
      return defaultDeLoadFlags(nextPhases, mesocycleLengthWeeks, totalWeeks, deLoadEveryNWeeks);
    });
  }

  function movePhase(index: number, direction: -1 | 1) {
    setPhases((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const current = next[index];
      const swap = next[target];
      if (!current || !swap) return prev;
      next[index] = swap;
      next[target] = current;
      return next.map((p, i) => ({ ...p, sortOrder: i }));
    });
  }

  function resetPhasesToSuggested() {
    if (totalWeeks <= 0) {
      setError("Set season dates first");
      return;
    }
    if (
      !confirm(
        "Replace all macro phases with the suggested layout for this season length? This cannot be undone until you save."
      )
    ) {
      return;
    }
    const drafts = suggestedPhaseDrafts(totalWeeks, mesocycleLengthWeeks);
    setPhases(drafts);
    setDeLoadWeekFlags(
      defaultDeLoadFlags(drafts, mesocycleLengthWeeks, totalWeeks, deLoadEveryNWeeks)
    );
    setError(null);
  }

  function applyDeLoadCadence(everyNWeeks = deLoadEveryNWeeks) {
    setDeLoadWeekFlags(
      defaultDeLoadFlags(phases, mesocycleLengthWeeks, totalWeeks, everyNWeeks)
    );
  }

  function toggleDeLoadWeek(weekIndex: number) {
    setDeLoadWeekFlags((prev) => {
      const next = [...prev];
      while (next.length < totalWeeks) next.push(false);
      next[weekIndex] = !next[weekIndex];
      return next.slice(0, totalWeeks);
    });
  }

  function toggleLongRideWeek(weekIndex: number) {
    setLongRideWeekFlags((prev) => {
      const next = [...prev];
      while (next.length < totalWeeks) next.push(false);
      next[weekIndex] = !next[weekIndex];
      return next.slice(0, totalWeeks);
    });
  }

  function toggleLongRunWeek(weekIndex: number) {
    setLongRunWeekFlags((prev) => {
      const next = [...prev];
      while (next.length < totalWeeks) next.push(false);
      next[weekIndex] = !next[weekIndex];
      return next.slice(0, totalWeeks);
    });
  }

  function applyLongWeekPreset(preset: LongWeekPreset) {
    const deLoadFlags = [...deLoadWeekFlags];
    while (deLoadFlags.length < totalWeeks) deLoadFlags.push(false);
    const paddedDeLoad = deLoadFlags.slice(0, Math.max(totalWeeks, 0));
    const rideFlags = defaultLongFlagsForPlan(
      phases,
      mesocycleLengthWeeks,
      totalWeeks,
      paddedDeLoad,
      preset
    );
    const runFlags = defaultLongFlagsForPlan(
      phases,
      mesocycleLengthWeeks,
      totalWeeks,
      paddedDeLoad,
      preset
    );
    setLongRideWeekFlags(rideFlags);
    setLongRunWeekFlags(runFlags);
  }

  function updateDeLoadEveryNWeeks(value: number) {
    setDeLoadEveryNWeeks(value);
    setDeLoadWeekFlags(
      defaultDeLoadFlags(phases, mesocycleLengthWeeks, totalWeeks, value)
    );
  }

  function applySeasonResponse(season: SeasonData) {
    setSeasonId(season.id);
    setTotalWeeks(season.totalWeeks);
    setPhasesAutoAdjusted(false);
    if (season.phases.length > 0) {
      const normalized = normalizePhasesFromApi(season.phases, season.mesocycleLengthWeeks);
      setPhases(normalized);
      const storedFlags = flagsFromSeason(season);
      const deLoad =
        storedFlags ??
        defaultDeLoadFlags(
          normalized,
          season.mesocycleLengthWeeks,
          season.totalWeeks,
          season.deLoadEveryNWeeks
        );
      setDeLoadWeekFlags(deLoad);
      setLongRideWeekFlags(
        season.longRideWeekFlags?.length === season.totalWeeks
          ? season.longRideWeekFlags
          : defaultLongFlagsForPlan(
              normalized,
              season.mesocycleLengthWeeks,
              season.totalWeeks,
              deLoad
            )
      );
      setLongRunWeekFlags(
        season.longRunWeekFlags?.length === season.totalWeeks
          ? season.longRunWeekFlags
          : defaultLongFlagsForPlan(
              normalized,
              season.mesocycleLengthWeeks,
              season.totalWeeks,
              deLoad
            )
      );
    }
  }

  function addBRace() {
    setBRaces((prev) => [...prev, emptyGoalEventDraft()]);
  }

  function addCRace() {
    setCRaces((prev) => [...prev, emptyGoalEventDraft()]);
  }

  function updateBRace(index: number, race: GoalEventDraft) {
    setBRaces((prev) => prev.map((r, i) => (i === index ? race : r)));
  }

  function updateCRace(index: number, race: GoalEventDraft) {
    setCRaces((prev) => prev.map((r, i) => (i === index ? race : r)));
  }

  function removeBRace(index: number, deleteFromCalendar: boolean) {
    setBRaces((prev) => {
      const race = prev[index];
      if (race?.id) {
        setPendingRemovals((r) => [...r, { id: race.id!, deleteFromCalendar }]);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function removeCRace(index: number, deleteFromCalendar: boolean) {
    setCRaces((prev) => {
      const race = prev[index];
      if (race?.id) {
        setPendingRemovals((r) => [...r, { id: race.id!, deleteFromCalendar }]);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function importCalendarRace(session: UnlinkedRaceSession, priority: "B" | "C") {
    const draft: GoalEventDraft = {
      plannedSessionId: session.plannedSessionId,
      name: session.name,
      date: session.date,
      disciplines: session.disciplines,
      distanceMeters: session.distanceMeters ?? null,
      estimatedDurationMinutes: session.estimatedDurationMinutes ?? null,
      notes: session.notes ?? null,
    };
    if (priority === "B") setBRaces((prev) => [...prev, draft]);
    else setCRaces((prev) => [...prev, draft]);
    setUnlinkedCalendarRaces((prev) =>
      prev.filter((s) => s.plannedSessionId !== session.plannedSessionId)
    );
  }

  function splitRacesForSave(races: GoalEventDraft[], priority: "B" | "C") {
    const complete = races.filter(isGoalEventComplete);
    const links = complete
      .filter((r) => r.plannedSessionId && !r.id)
      .map((r) => ({
        ...goalEventPayload(r),
        plannedSessionId: r.plannedSessionId!,
        priority,
      }));
    const events = complete
      .filter((r) => !r.plannedSessionId || r.id)
      .map(goalEventPayload);
    return { links, events };
  }

  async function saveStep0(): Promise<boolean> {
    if (!name.trim() || !startDate || !endDate) {
      setError("Fill in season name and dates");
      return false;
    }
    if (!isGoalEventComplete(aRace)) {
      setError("A-race name, date, and at least one discipline are required");
      return false;
    }
    const partial = [...bRaces, ...cRaces].find(isGoalEventPartial);
    if (partial) {
      setError("Complete or remove partially filled B/C races");
      return false;
    }
    const partialTimes = [...bRaces, ...cRaces, aRace].find(isGoalEventTimesPartial);
    if (partialTimes) {
      setError("Enter a goal time for each selected discipline, or leave all blank");
      return false;
    }

    const bSplit = splitRacesForSave(bRaces, "B");
    const cSplit = splitRacesForSave(cRaces, "C");

    setSaving(true);
    setError(null);
    setSuccess(null);
    const body = {
      name: name.trim(),
      startDate,
      endDate,
      goalEvent: goalEventPayload(aRace),
      bGoalEvents: bSplit.events,
      cGoalEvents: cSplit.events,
      removedGoalEvents: pendingRemovals,
      linkCalendarRaces: [...bSplit.links, ...cSplit.links],
    };
    const res = seasonId
      ? await fetch(`/api/plan/season/${seasonId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/plan/season", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(typeof data.error === "string" ? data.error : "Could not save season setup");
      return false;
    }
    const data = (await res.json()) as { season: SeasonData };
    applySeasonResponse(data.season);
    return true;
  }

  async function patchSeason(payload: Record<string, unknown>): Promise<boolean> {
    if (!seasonId) {
      setError("Save season setup first");
      return false;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const body =
      "phases" in payload && Array.isArray(payload.phases)
        ? { ...payload, phases: phasesForApi(payload.phases as PhaseDraft[]) }
        : payload;
    const res = await fetch(`/api/plan/season/${seasonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(typeof data.error === "string" ? data.error : "Could not save changes");
      return false;
    }
    const data = (await res.json()) as { season: SeasonData };
    applySeasonResponse(data.season);
    return true;
  }

  function validatePhaseWeeks(): boolean {
    if (totalWeeks <= 0) return true;
    if (phaseWeekTotal !== totalWeeks) {
      setError(
        `Phase weeks (${phaseWeekTotal}) must equal season length (${totalWeeks} weeks).`
      );
      return false;
    }
    return true;
  }

  function validateMesocycles(): boolean {
    if (!allPhaseMesocyclesValid(phases)) {
      const invalid = phases.find((p) => mesocycleWeekTotal(p.mesocycles) !== p.weekCount);
      if (invalid) {
        setError(
          `Mesocycle weeks in "${invalid.name}" (${mesocycleWeekTotal(invalid.mesocycles)}) must equal phase length (${invalid.weekCount} weeks).`
        );
        return false;
      }
      setError("Each phase needs at least one mesocycle.");
      return false;
    }
    return true;
  }

  const phaseWeeksValid = totalWeeks <= 0 || phaseWeekTotal === totalWeeks;
  const mesocyclesValid = phases.length === 0 || allPhaseMesocyclesValid(phases);
  const cycleStructureValid = phaseWeeksValid && mesocyclesValid;

  const resolvedMesocycles = useMemo(
    () => resolveMesocycles(phasesToSeasonInput(phases), mesocycleLengthWeeks),
    [phases, mesocycleLengthWeeks]
  );

  const deLoadFlagsForDisplay = useMemo(() => {
    const flags = [...deLoadWeekFlags];
    while (flags.length < totalWeeks) flags.push(false);
    return flags.slice(0, Math.max(totalWeeks, 0));
  }, [deLoadWeekFlags, totalWeeks]);

  const longRideFlagsForDisplay = useMemo(() => {
    const flags = [...longRideWeekFlags];
    while (flags.length < totalWeeks) flags.push(false);
    return flags.slice(0, Math.max(totalWeeks, 0));
  }, [longRideWeekFlags, totalWeeks]);

  const longRunFlagsForDisplay = useMemo(() => {
    const flags = [...longRunWeekFlags];
    while (flags.length < totalWeeks) flags.push(false);
    return flags.slice(0, Math.max(totalWeeks, 0));
  }, [longRunWeekFlags, totalWeeks]);

  const resolvedPhaseTargets = useMemo(() => {
    if (!cycleStructureValid || phases.length === 0) return [];
    try {
      return resolvePhaseTargets(phasesToSeasonInput(phases), {
        startHours,
        peakHours,
        longRideStartMin,
        longRidePeakMin,
        longRunStartMin,
        longRunPeakMin,
      });
    } catch {
      return [];
    }
  }, [
    cycleStructureValid,
    phases,
    startHours,
    peakHours,
    longRideStartMin,
    longRidePeakMin,
    longRunStartMin,
    longRunPeakMin,
  ]);

  const seasonSplit = useMemo(
    () => ({
      swimSplitPercent,
      bikeSplitPercent,
      runSplitPercent,
    }),
    [swimSplitPercent, bikeSplitPercent, runSplitPercent]
  );

  const resolvedDisciplineTargets = useMemo(() => {
    if (!cycleStructureValid || phases.length === 0) {
      return { swim: [], bike: [], run: [] } as Record<
        DisciplineKey,
        ReturnType<typeof resolveDisciplineTargets>
      >;
    }
    const anchors = {
      startHours,
      peakHours,
      longRideStartMin,
      longRidePeakMin,
      longRunStartMin,
      longRunPeakMin,
    };
    const phaseInput = phasesToSeasonInput(phases);
    return {
      swim: resolveDisciplineTargets(phaseInput, anchors, "swim", seasonSplit),
      bike: resolveDisciplineTargets(phaseInput, anchors, "bike", seasonSplit),
      run: resolveDisciplineTargets(phaseInput, anchors, "run", seasonSplit),
    };
  }, [
    cycleStructureValid,
    phases,
    startHours,
    peakHours,
    longRideStartMin,
    longRidePeakMin,
    longRunStartMin,
    longRunPeakMin,
    seasonSplit,
  ]);

  const longSessionWeekPreview = useMemo(() => [], []);

  async function saveStep(step: number): Promise<boolean> {
    if (step === 0) return saveStep0();
    if (step === 1) {
      if (!validatePhaseWeeks()) return false;
      if (!validateMesocycles()) return false;
      return patchSeason({ mesocycleLengthWeeks, phases });
    }
    if (step === 2) {
      return patchSeason({ phases });
    }
    if (step === 3) {
      return true;
    }
    if (step === 4) {
      if (!cycleStructureValid) return false;
      return patchSeason({
        startHours,
        peakHours,
        swimSplitPercent,
        bikeSplitPercent,
        runSplitPercent,
        maxRampPercent,
        longRideStartMin,
        longRidePeakMin,
        longRunStartMin,
        longRunPeakMin,
        longRideWeekFlags: longRideFlagsForDisplay,
        longRunWeekFlags: longRunFlagsForDisplay,
        deLoadEveryNWeeks,
        deLoadVolumePercent,
        deLoadStrategy,
        reduceCountsOnDeLoad,
        deLoadWeekFlags: deLoadFlagsForDisplay,
        phases,
      });
    }
    return false;
  }

  async function saveStepWithFeedback(step: number): Promise<boolean> {
    const ok = await saveStep(step);
    if (ok) setSuccess("Changes saved");
    return ok;
  }

  async function finishWizard(): Promise<boolean> {
    const ok = await patchSeason({ setupComplete: true });
    if (ok) {
      router.push(seasonIdParam ? `/plan?seasonId=${seasonIdParam}` : "/plan");
    }
    return ok;
  }

  return {
    loading,
    saving,
    error,
    success,
    seasonId,
    name,
    setName,
    disciplineSettings,
    startDate,
    setStartDate: changeStartDate,
    endDate,
    setEndDate: changeEndDate,
    phasesAutoAdjusted,
    aRace,
    setARace,
    bRaces,
    cRaces,
    addBRace,
    addCRace,
    updateBRace,
    updateCRace,
    removeBRace,
    removeCRace,
    unlinkedCalendarRaces,
    importCalendarRace,
    mesocycleLengthWeeks,
    setMesocycleLengthWeeks,
    phases,
    totalWeeks,
    phaseWeekTotal,
    updatePhase,
    resizePhaseBoundary,
    updateDisciplineFocus,
    addPhase,
    removePhase,
    movePhase,
    resetPhasesToSuggested,
    updateMesocycle,
    addMesocycle,
    removeMesocycle,
    autoSplitPhaseMesocycles,
    autoSplitAllMesocycles,
    startHours,
    setStartHours,
    peakHours,
    setPeakHours,
    swimSplitPercent,
    setSwimSplitPercent,
    bikeSplitPercent,
    setBikeSplitPercent,
    runSplitPercent,
    setRunSplitPercent,
    maxRampPercent,
    setMaxRampPercent,
    longRideStartMin,
    setLongRideStartMin,
    longRidePeakMin,
    setLongRidePeakMin,
    longRunStartMin,
    setLongRunStartMin,
    longRunPeakMin,
    setLongRunPeakMin,
    deLoadEveryNWeeks,
    setDeLoadEveryNWeeks: updateDeLoadEveryNWeeks,
    deLoadVolumePercent,
    setDeLoadVolumePercent,
    deLoadStrategy,
    setDeLoadStrategy,
    reduceCountsOnDeLoad,
    setReduceCountsOnDeLoad,
    deLoadWeekFlags: deLoadFlagsForDisplay,
    toggleDeLoadWeek,
    applyDeLoadCadence,
    longRideWeekFlags: longRideFlagsForDisplay,
    longRunWeekFlags: longRunFlagsForDisplay,
    toggleLongRideWeek,
    toggleLongRunWeek,
    applyLongWeekPreset,
    longSessionWeekPreview,
    resolvedMesocycles,
    resolvedPhaseTargets,
    resolvedDisciplineTargets,
    saveStep,
    saveStepWithFeedback,
    finishWizard,
    validatePhaseWeeks,
    phaseWeeksValid,
    mesocyclesValid,
    cycleStructureValid,
  };
}

export type SeasonSettingsState = ReturnType<typeof useSeasonSettings>;

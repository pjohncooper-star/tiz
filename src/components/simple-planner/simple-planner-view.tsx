"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { SimplePlannerAnchorSection } from "@/components/simple-planner/simple-planner-anchor-section";
import { SimplePlannerLongSessionSection } from "@/components/simple-planner/simple-planner-long-session-section";
import { SimplePlannerPhasesPane } from "@/components/simple-planner/simple-planner-phases-pane";
import { SimplePlannerTimeline } from "@/components/simple-planner/simple-planner-timeline";
import { SimplePlannerWeekTable } from "@/components/simple-planner/simple-planner-week-table";
import {
  DEFAULT_LONG_SESSION_DEFAULTS,
  emptyRace,
  DEFAULT_PHASE_SESSIONS,
  DEFAULT_PHASE_INTENSE_DAYS,
  type SimpleGoalEvent,
  type SimplePhase,
  type SimpleSeason,
  type SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import { GoalRaceEditor } from "@/components/season/goal-race-editor";
import {
  formatGoalDisciplines,
  goalEventFromApi,
  isGoalEventComplete,
  isGoalEventPartial,
  isGoalEventTimesPartial,
  type GoalEventDraft,
  type UnlinkedRaceSession,
} from "@/components/season/season-settings-types";
import { formatGoalTimeDisplay } from "@/lib/plan/goal-time";
import {
  goalEventDraftPayload,
  splitRacesForSave,
} from "@/lib/plan/season/goal-event-api";
import { defaultSimpleRampDefaults, type SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import {
  defaultZoneRampDefaults,
  type ZoneRampDefaultsByDiscipline,
} from "@/lib/plan/season/simple-tiz";
import { useDisciplineSettings } from "@/lib/units/use-discipline-settings";
import {
  distanceDisplayToMeters,
  distanceMetersToDisplay,
  hoursFromDisciplineDistance,
  PlannerPaceInput,
} from "@/components/simple-planner/simple-planner-volume-display";
import { applySimpleSeasonDateBounds } from "@/lib/plan/season/simple-season-weeks";
import { DEFAULT_RECOVERY_SETTINGS, type RecoverySettings } from "@/lib/plan/season/recovery";
import { normalizePhasesToFullCoverage } from "@/lib/plan/season/phase-span-utils";
import { resolvePhaseVolumeSettings } from "@/lib/plan/season/phase-volume-settings";
import { ZoneRampPillRow } from "@/components/simple-planner/zone-pill";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";

function normalizeSeason(season: SimpleSeason): SimpleSeason {
  const mapGoal = (event: SimpleGoalEvent): SimpleGoalEvent => ({
    ...goalEventFromApi(event),
    id: event.id,
    plannedSessionId: event.plannedSessionId,
    priority: event.priority,
  });

  return {
    ...season,
    recovery: season.recovery ?? DEFAULT_RECOVERY_SETTINGS,
    longSessionDefaults: season.longSessionDefaults ?? DEFAULT_LONG_SESSION_DEFAULTS,
    unlinkedRaceSessions: season.unlinkedRaceSessions ?? [],
    zoneRampDefaults: season.zoneRampDefaults ?? defaultZoneRampDefaults(),
    phases: normalizePhasesToFullCoverage(
      season.phases.map((phase) => {
        const volume = resolvePhaseVolumeSettings({
          volumeTrend: phase.volumeTrend,
          volumeTargetPercent: phase.volumeTargetPercent,
          volumeTaperStartPercent: phase.volumeTaperStartPercent,
          volumeTaperEndPercent: phase.volumeTaperEndPercent,
          longSessionCadence: phase.longSessionCadence,
          suppressRecovery: phase.suppressRecovery,
          name: phase.name,
        });
        return {
          ...phase,
          swimSessionsPerWeek: phase.swimSessionsPerWeek ?? DEFAULT_PHASE_SESSIONS.swimSessionsPerWeek,
          bikeSessionsPerWeek: phase.bikeSessionsPerWeek ?? DEFAULT_PHASE_SESSIONS.bikeSessionsPerWeek,
          runSessionsPerWeek: phase.runSessionsPerWeek ?? DEFAULT_PHASE_SESSIONS.runSessionsPerWeek,
          strengthSessionsPerWeek:
            phase.strengthSessionsPerWeek ?? DEFAULT_PHASE_SESSIONS.strengthSessionsPerWeek,
          swimIntenseDaysPerWeek:
            phase.swimIntenseDaysPerWeek ?? DEFAULT_PHASE_INTENSE_DAYS.swimIntenseDaysPerWeek,
          bikeIntenseDaysPerWeek:
            phase.bikeIntenseDaysPerWeek ?? DEFAULT_PHASE_INTENSE_DAYS.bikeIntenseDaysPerWeek,
          runIntenseDaysPerWeek:
            phase.runIntenseDaysPerWeek ?? DEFAULT_PHASE_INTENSE_DAYS.runIntenseDaysPerWeek,
          volumeTrend: volume.volumeTrend,
          volumeTargetPercent: volume.volumeTargetPercent,
          volumeTaperStartPercent: volume.volumeTaperStartPercent,
          volumeTaperEndPercent: volume.volumeTaperEndPercent,
          longSessionCadence: volume.longSessionCadence,
          suppressRecovery: volume.suppressRecovery,
        };
      }),
      season.totalWeeks
    ),
    weeks: season.weeks.map((week) => ({
      ...week,
      zoneMinutes: week.zoneMinutes ?? {},
      longRideMinutes: week.longRideMinutes ?? 0,
      longRunMinutes: week.longRunMinutes ?? 0,
    })),
    primaryGoalEvent: season.primaryGoalEvent ? mapGoal(season.primaryGoalEvent) : null,
    goalEvents: season.goalEvents.map(mapGoal),
  };
}

type PlannerSectionId =
  | "season"
  | "races"
  | "timeline"
  | "phases"
  | "ramps"
  | "zoneRamps"
  | "recovery"
  | "longSessions"
  | "anchorWorkouts"
  | "weeklyVolume";

const DEFAULT_SECTION_EXPANDED: Record<PlannerSectionId, boolean> = {
  season: true,
  races: false,
  timeline: true,
  phases: false,
  ramps: false,
  zoneRamps: false,
  recovery: false,
  longSessions: false,
  anchorWorkouts: false,
  weeklyVolume: true,
};

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-5 py-4 text-left"
        aria-expanded={expanded}
      >
        <span className="text-xs text-zinc-400">{expanded ? "▼" : "▶"}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      </button>
      {expanded ? <div className="border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800">{children}</div> : null}
    </section>
  );
}

function formatSaveError(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return "Save failed.";
  }
  const error = (body as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const flat = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | unknown[]>;
    };
    const form = flat.formErrors?.filter(Boolean) ?? [];
    if (form.length > 0) return form.join(" ");
    for (const messages of Object.values(flat.fieldErrors ?? {})) {
      if (Array.isArray(messages) && messages.length > 0) {
        const first = messages[0];
        if (typeof first === "string") return first;
      }
    }
  }
  return "Save failed. Check the browser Network tab for details.";
}

function buildPrimaryGoalEventPayload(
  aRace: SimpleGoalEvent,
  fallbackDate: string
): ReturnType<typeof goalEventDraftPayload> | undefined {
  if (aRace.id) {
    return goalEventDraftPayload({
      ...aRace,
      name: aRace.name.trim() || "A race",
      date: aRace.date || fallbackDate,
      disciplines: aRace.disciplines.length > 0 ? aRace.disciplines : ["RUN"],
    });
  }
  if (!isGoalEventComplete(aRace)) return undefined;
  return goalEventDraftPayload(aRace);
}

function defaultSeasonDates() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function SimplePlannerView() {
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const [season, setSeason] = useState<SimpleSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState(DEFAULT_SECTION_EXPANDED);

  const [pendingRemovals, setPendingRemovals] = useState<
    { id: string; deleteFromCalendar: boolean }[]
  >([]);

  const toggleSection = useCallback((sectionId: PlannerSectionId) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const [createMode, setCreateMode] = useState(false);
  const [draftName, setDraftName] = useState("2026 Season");
  const [draftDates, setDraftDates] = useState(defaultSeasonDates);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = seasonIdParam
      ? `/api/plan/season?seasonId=${encodeURIComponent(seasonIdParam)}`
      : "/api/plan/season";
    const res = await fetch(url);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        typeof body?.error === "string" ? body.error : "Could not load season plan."
      );
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { season: SimpleSeason | null };
    setSeason(data.season ? normalizeSeason(data.season) : null);
    setPendingRemovals([]);
    setCreateMode(!data.season);
    setLoading(false);
  }, [seasonIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const racesByPriority = useMemo(() => {
    if (!season) {
      return { a: emptyRace("A"), b: [] as SimpleGoalEvent[], c: [] as SimpleGoalEvent[] };
    }
    const a =
      season.primaryGoalEvent ??
      season.goalEvents.find((event) => event.priority === "A") ??
      emptyRace("A");
    return {
      a,
      b: season.goalEvents.filter((event) => event.priority === "B"),
      c: season.goalEvents.filter((event) => event.priority === "C"),
    };
  }, [season]);

  async function saveSeason(payload: Record<string, unknown>) {
    if (!season) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/plan/season/${season.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as unknown;
      setError(formatSaveError(body));
      return;
    }
    const data = (await res.json()) as { season: SimpleSeason };
    setSeason(normalizeSeason(data.season));
    setPendingRemovals([]);
  }

  async function handleCreateSeason() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/plan/season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName,
        startDate: draftDates.startDate,
        endDate: draftDates.endDate,
        rampDefaults: defaultSimpleRampDefaults(),
        zoneRampDefaults: defaultZoneRampDefaults(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(typeof body.error === "string" ? body.error : "Could not create season.");
      return;
    }
    const data = (await res.json()) as { season: SimpleSeason };
    setSeason(normalizeSeason({
      ...data.season,
      zoneRampDefaults: data.season.zoneRampDefaults ?? defaultZoneRampDefaults(),
      weeks: data.season.weeks.map((week) => ({
        ...week,
        zoneMinutes: week.zoneMinutes ?? {},
      })),
    }));
    setCreateMode(false);
    setExpandedSections(DEFAULT_SECTION_EXPANDED);
  }

  const { disciplineSettings } = useDisciplineSettings();

  function serializeWeeksForSave(weeks: SimpleSeason["weeks"]) {
    return weeks.map(
      ({ weekStartDate: _d, totalHours: _t, ...week }) => week
    );
  }

  function savePayload(extra: Record<string, unknown> = {}) {
    if (!season) return extra;
    const aRace = season.primaryGoalEvent ?? racesByPriority.a;
    const bRaces = season.goalEvents.filter((event) => event.priority === "B");
    const cRaces = season.goalEvents.filter((event) => event.priority === "C");
    const bSplit = splitRacesForSave(bRaces, "B");
    const cSplit = splitRacesForSave(cRaces, "C");
    const goalEvent = buildPrimaryGoalEventPayload(aRace, season.endDate);
    return {
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      rampDefaults: season.rampDefaults,
      zoneRampDefaults: season.zoneRampDefaults,
      recovery: season.recovery,
      longSessionDefaults: season.longSessionDefaults,
      phases: season.phases,
      weeks: serializeWeeksForSave(season.weeks),
      ...(goalEvent ? { goalEvent } : {}),
      bGoalEvents: bSplit.events,
      cGoalEvents: cSplit.events,
      linkCalendarRaces: [...bSplit.links, ...cSplit.links],
      removedGoalEvents: pendingRemovals,
      ...extra,
    };
  }

  function validateRacesForSave(): string | null {
    if (!season) return "No season loaded";
    const aRace = season.primaryGoalEvent ?? racesByPriority.a;
    if (!isGoalEventComplete(aRace)) {
      return "A-race name, date, and at least one discipline are required";
    }
    const enteredRaces = season.goalEvents.filter(
      (race) => isGoalEventComplete(race) || isGoalEventPartial(race)
    );
    const partial = enteredRaces.find(isGoalEventPartial);
    if (partial) {
      return `Complete or remove partially filled ${partial.priority} race "${partial.name || "(unnamed)"}"`;
    }
    const partialTimes = enteredRaces.find(isGoalEventTimesPartial);
    if (partialTimes) {
      return "Enter a goal time for each selected discipline, or leave all blank";
    }
    return null;
  }

  async function handleSave() {
    const raceError = validateRacesForSave();
    if (raceError) {
      setError(raceError);
      setExpandedSections((current) => ({ ...current, races: true }));
      return;
    }
    await saveSeason(savePayload());
  }
  function handleSelectWeek(weekIndex: number) {
    setSelectedWeekIndex(weekIndex);
    document
      .getElementById(`week-row-${weekIndex}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading season…</p>;
  }

  if (createMode || !season) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Season planner</h1>
          <p className="text-sm text-zinc-500">Create a season to start planning volume.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Card>
          <div className="space-y-4">
            <div>
              <Label>Season name</Label>
              <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={draftDates.startDate}
                  onChange={(event) =>
                    setDraftDates({ ...draftDates, startDate: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  type="date"
                  value={draftDates.endDate}
                  onChange={(event) =>
                    setDraftDates({ ...draftDates, endDate: event.target.value })
                  }
                />
              </div>
            </div>
            <Button type="button" disabled={saving} onClick={() => void handleCreateSeason()}>
              Create season
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Season planner</h1>
          <p className="text-sm text-zinc-500">
            {season.startDate} → {season.endDate} · {season.totalWeeks} weeks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/plan/seasons"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            All seasons
          </Link>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <CollapsibleSection
        title="Season"
        expanded={expandedSections.season}
        onToggle={() => toggleSection("season")}
      >
        <div className="space-y-4">
          <div>
            <Label>Season name</Label>
            <Input
              value={season.name}
              onChange={(event) => setSeason({ ...season, name: event.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={season.startDate}
                onChange={(event) =>
                  setSeason((current) =>
                    current
                      ? normalizeSeason({
                          ...current,
                          ...applySimpleSeasonDateBounds({
                            startDate: event.target.value,
                            endDate: current.endDate,
                            totalWeeks: current.totalWeeks,
                            phases: current.phases,
                            weeks: current.weeks,
                            rampDefaults: current.rampDefaults,
                          }),
                        })
                      : current
                  )
                }
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={season.endDate}
                onChange={(event) =>
                  setSeason((current) =>
                    current
                      ? normalizeSeason({
                          ...current,
                          ...applySimpleSeasonDateBounds({
                            startDate: current.startDate,
                            endDate: event.target.value,
                            totalWeeks: current.totalWeeks,
                            phases: current.phases,
                            weeks: current.weeks,
                            rampDefaults: current.rampDefaults,
                          }),
                        })
                      : current
                  )
                }
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Races"
        expanded={expandedSections.races}
        onToggle={() => toggleSection("races")}
      >
        <RaceSection
          aRace={racesByPriority.a}
          bRaces={racesByPriority.b}
          cRaces={racesByPriority.c}
          unlinkedCalendarRaces={season.unlinkedRaceSessions}
          disciplineSettings={disciplineSettings}
          onChange={(goalEvent, bGoalEvents, cGoalEvents, unlinked) => {
            setSeason({
              ...season,
              primaryGoalEvent: goalEvent,
              goalEvents: [
                { ...goalEvent, priority: "A" as const },
                ...bGoalEvents.map((event) => ({ ...event, priority: "B" as const })),
                ...cGoalEvents.map((event) => ({ ...event, priority: "C" as const })),
              ],
              unlinkedRaceSessions: unlinked,
            });
          }}
          onRemoveRace={(priority, index, deleteFromCalendar) => {
            if (priority === "B") {
              const race = racesByPriority.b[index];
              if (race?.id) {
                setPendingRemovals((current) => [
                  ...current,
                  { id: race.id!, deleteFromCalendar },
                ]);
              }
              const bRaces = racesByPriority.b.filter((_, i) => i !== index);
              setSeason({
                ...season,
                goalEvents: [
                  { ...racesByPriority.a, priority: "A" },
                  ...bRaces.map((event) => ({ ...event, priority: "B" as const })),
                  ...racesByPriority.c.map((event) => ({ ...event, priority: "C" as const })),
                ],
              });
            } else {
              const race = racesByPriority.c[index];
              if (race?.id) {
                setPendingRemovals((current) => [
                  ...current,
                  { id: race.id!, deleteFromCalendar },
                ]);
              }
              const cRaces = racesByPriority.c.filter((_, i) => i !== index);
              setSeason({
                ...season,
                goalEvents: [
                  { ...racesByPriority.a, priority: "A" },
                  ...racesByPriority.b.map((event) => ({ ...event, priority: "B" as const })),
                  ...cRaces.map((event) => ({ ...event, priority: "C" as const })),
                ],
              });
            }
          }}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Timeline"
        expanded={expandedSections.timeline}
        onToggle={() => toggleSection("timeline")}
      >
        <SimplePlannerTimeline
          seasonStart={season.startDate}
          weeks={season.weeks}
          phases={season.phases}
          goalEvents={season.goalEvents}
          primaryGoalEvent={season.primaryGoalEvent}
          selectedWeekIndex={selectedWeekIndex}
          onSelectWeek={handleSelectWeek}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Phases"
        expanded={expandedSections.phases}
        onToggle={() => toggleSection("phases")}
      >
        <SimplePlannerPhasesPane
          seasonPlanId={season.id}
          seasonStartDate={season.startDate}
          phases={season.phases}
          totalWeeks={season.totalWeeks}
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={setSelectedPhaseId}
          onPhasesChange={(phases) => setSeason({ ...season, phases })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Ramp defaults"
        expanded={expandedSections.ramps}
        onToggle={() => toggleSection("ramps")}
      >
        <RampDefaultsEditor
          value={season.rampDefaults}
          disciplineSettings={disciplineSettings}
          onChange={(rampDefaults) => setSeason({ ...season, rampDefaults })}
          onRecalculate={() => void saveSeason(savePayload({ recalculate: true }))}
          saving={saving}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Zone ramp defaults"
        expanded={expandedSections.zoneRamps}
        onToggle={() => toggleSection("zoneRamps")}
      >
        <ZoneRampDefaultsEditor
          value={season.zoneRampDefaults}
          onChange={(zoneRampDefaults) => setSeason({ ...season, zoneRampDefaults })}
          onRecalculate={() =>
            void saveSeason(savePayload({ recalculate: true, resetZoneOverrides: true }))
          }
          saving={saving}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Recovery & de-load"
        expanded={expandedSections.recovery}
        onToggle={() => toggleSection("recovery")}
      >
        <RecoverySettingsEditor
          value={season.recovery}
          onChange={(recovery) => setSeason({ ...season, recovery })}
          onApplyCadence={() =>
            void saveSeason(
              savePayload({
                applyRecoveryCadence: true,
                recalculate: true,
              })
            )
          }
          saving={saving}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Long sessions"
        expanded={expandedSections.longSessions}
        onToggle={() => toggleSection("longSessions")}
      >
        <SimplePlannerLongSessionSection
          longSessionDefaults={season.longSessionDefaults}
          phases={season.phases}
          weeks={season.weeks}
          totalWeeks={season.totalWeeks}
          rampDefaults={season.rampDefaults}
          onChange={(longSessionDefaults) => setSeason({ ...season, longSessionDefaults })}
          onRecalculate={() =>
            void saveSeason(savePayload({ recalculate: true }))
          }
          saving={saving}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Anchor workouts"
        expanded={expandedSections.anchorWorkouts}
        onToggle={() => toggleSection("anchorWorkouts")}
      >
        <SimplePlannerAnchorSection
          seasonPlanId={season.id}
          startDate={season.startDate}
          phases={season.phases}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Weekly volume"
        expanded={expandedSections.weeklyVolume}
        onToggle={() => toggleSection("weeklyVolume")}
      >
        <SimplePlannerWeekTable
          weeks={season.weeks}
          phases={season.phases}
          rampDefaults={season.rampDefaults}
          disciplineSettings={disciplineSettings}
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={setSelectedPhaseId}
          highlightedWeekIndex={selectedWeekIndex}
          onWeeksChange={(weeks) => setSeason({ ...season, weeks })}
          onPhasesChange={(phases) => setSeason({ ...season, phases })}
        />
      </CollapsibleSection>
    </div>
  );
}

function RecoverySettingsEditor({
  value,
  onChange,
  onApplyCadence,
  saving,
}: {
  value: RecoverySettings;
  onChange: (value: RecoverySettings) => void;
  onApplyCadence: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Recovery volume</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              min={30}
              max={90}
              className="w-24"
              value={value.volumePercent}
              onChange={(event) =>
                onChange({ ...value, volumePercent: Number(event.target.value) })
              }
            />
            <span className="text-sm text-zinc-500">% of load-week hours</span>
          </div>
        </div>
        <div>
          <Label>Load weeks per recovery</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={6}
              className="w-24"
              value={value.loadWeeks}
              onChange={(event) =>
                onChange({ ...value, loadWeeks: Number(event.target.value) })
              }
            />
            <span className="text-sm text-zinc-500">
              e.g. 3 → three load weeks, then one recovery
            </span>
          </div>
        </div>
      </div>

      <div>
        <Label>Zone behavior on recovery weeks</Label>
        <select
          className="mt-1 w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          value={value.zoneMode}
          onChange={(event) =>
            onChange({
              ...value,
              zoneMode: event.target.value as RecoverySettings["zoneMode"],
            })
          }
        >
          <option value="proportional">Match volume (scale all zones)</option>
          <option value="intensity_shift">Reduce Z3–Z5, increase Z1–Z2</option>
        </select>
      </div>

      {value.zoneMode === "intensity_shift" && (
        <div>
          <Label>High-zone reduction</Label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              className="w-24"
              value={value.highZoneCutPercent}
              onChange={(event) =>
                onChange({ ...value, highZoneCutPercent: Number(event.target.value) })
              }
            />
            <span className="text-sm text-zinc-500">% off Z3, Z4, and Z5</span>
          </div>
        </div>
      )}

      <Button type="button" variant="secondary" disabled={saving} onClick={onApplyCadence}>
        Apply recovery cadence & recalculate
      </Button>
      <p className="text-xs text-zinc-500">
        Suggests recovery weeks on a repeating load:recovery pattern, then recalculates
        hours and zones. Weeks you edited manually are left unchanged.
      </p>
    </div>
  );
}

function RampDefaultsEditor({
  value,
  disciplineSettings,
  onChange,
  onRecalculate,
  saving,
}: {
  value: SimpleRampDefaults;
  disciplineSettings: ReturnType<typeof useDisciplineSettings>["disciplineSettings"];
  onChange: (value: SimpleRampDefaults) => void;
  onRecalculate: () => void;
  saving: boolean;
}) {
  const rows = [
    { key: "swim" as const, label: "Swim", paceDiscipline: "SWIM" as const },
    { key: "bike" as const, label: "Bike", paceDiscipline: null },
    { key: "run" as const, label: "Run", paceDiscipline: "RUN" as const },
  ];

  function updateDiscipline(
    key: "swim" | "bike" | "run",
    patch: Partial<SimpleRampDefaults["swim"]>
  ) {
    onChange({
      ...value,
      [key]: { ...value[key], ...patch },
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-4">Discipline</th>
              <th className="pb-2 pr-4">Mode</th>
              <th className="pb-2 pr-4">Start</th>
              <th className="pb-2 pr-4">Peak</th>
              <th className="pb-2 pr-4">Rate / wk</th>
              <th className="pb-2">Pace</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const def = value[row.key];
              const distanceMode = row.key !== "bike" && def.mode === "DISTANCE";
              return (
                <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-2 pr-4 font-medium">{row.label}</td>
                  <td className="py-2 pr-4">
                    {row.key === "bike" ? (
                      <span className="text-zinc-500">Hours</span>
                    ) : (
                      <select
                        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        value={def.mode}
                        onChange={(event) =>
                          updateDiscipline(row.key, {
                            mode: event.target.value as "HOURS" | "DISTANCE",
                          })
                        }
                      >
                        <option value="HOURS">Hours</option>
                        <option value="DISTANCE">Distance</option>
                      </select>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {distanceMode && row.paceDiscipline ? (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        className="w-28"
                        value={distanceMetersToDisplay(
                          def.startDistanceMeters,
                          row.paceDiscipline,
                          disciplineSettings
                        )}
                        onChange={(event) => {
                          const meters = distanceDisplayToMeters(
                            event.target.value,
                            row.paceDiscipline!,
                            disciplineSettings
                          );
                          if (meters == null) return;
                          updateDiscipline(row.key, {
                            startDistanceMeters: meters,
                            startHours: hoursFromDisciplineDistance(
                              row.paceDiscipline!,
                              meters,
                              def
                            ),
                          });
                        }}
                      />
                    ) : (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        className="w-24"
                        value={def.startHours}
                        onChange={(event) =>
                          updateDiscipline(row.key, {
                            startHours: Number(event.target.value),
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {distanceMode && row.paceDiscipline ? (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        className="w-28"
                        value={distanceMetersToDisplay(
                          def.peakDistanceMeters,
                          row.paceDiscipline,
                          disciplineSettings
                        )}
                        onChange={(event) => {
                          const meters = distanceDisplayToMeters(
                            event.target.value,
                            row.paceDiscipline!,
                            disciplineSettings
                          );
                          if (meters == null) return;
                          updateDiscipline(row.key, {
                            peakDistanceMeters: meters,
                            peakHours: hoursFromDisciplineDistance(
                              row.paceDiscipline!,
                              meters,
                              def
                            ),
                          });
                        }}
                      />
                    ) : (
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        className="w-24"
                        value={def.peakHours}
                        onChange={(event) =>
                          updateDiscipline(row.key, {
                            peakHours: Number(event.target.value),
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        className="w-20"
                        value={def.ratePercent}
                        onChange={(event) =>
                          updateDiscipline(row.key, {
                            ratePercent: Number(event.target.value),
                          })
                        }
                      />
                      <span className="text-zinc-500">%</span>
                    </div>
                  </td>
                  <td className="py-2">
                    {row.paceDiscipline ? (
                      <PlannerPaceInput
                        className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        value={def.referencePaceSeconds}
                        discipline={row.paceDiscipline}
                        disciplineSettings={disciplineSettings}
                        onChange={(seconds) =>
                          updateDiscipline(row.key, { referencePaceSeconds: seconds })
                        }
                      />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" disabled={saving} onClick={onRecalculate}>
        Recalculate ramp weeks
      </Button>
      <p className="text-xs text-zinc-500">
        Updates auto-calculated weeks only. Rest weeks, ramp-off phases, and overridden zone weeks
        stay manual.
      </p>
    </div>
  );
}

function ZoneRampDefaultsEditor({
  value,
  onChange,
  onRecalculate,
  saving,
}: {
  value: ZoneRampDefaultsByDiscipline;
  onChange: (value: ZoneRampDefaultsByDiscipline) => void;
  onRecalculate: () => void;
  saving: boolean;
}) {
  const disciplines = [
    { key: "SWIM" as const, label: "Swim" },
    { key: "BIKE" as const, label: "Bike" },
    { key: "RUN" as const, label: "Run" },
  ];
  const zones = [1, 2, 3, 4, 5] as const;

  function updateZone(
    discipline: "SWIM" | "BIKE" | "RUN",
    zone: typeof zones[number],
    patch: Partial<{ startMinutes: number; peakMinutes: number; ratePercent: number }>
  ) {
    const key = `z${zone}` as const;
    onChange({
      ...value,
      [discipline]: {
        ...value[discipline],
        [key]: { ...value[discipline][key], ...patch },
      },
    });
  }

  return (
    <div className="space-y-4">
      {disciplines.map((discipline) => (
        <div key={discipline.key}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {discipline.label}
          </p>
          <div className="space-y-1.5">
            {zones.map((zone) => {
              const key = `z${zone}` as const;
              const row = value[discipline.key][key];
              return (
                <ZoneRampPillRow
                  key={zone}
                  zone={zone}
                  startMinutes={row.startMinutes}
                  peakMinutes={row.peakMinutes}
                  ratePercent={row.ratePercent}
                  onStartChange={(startMinutes) =>
                    updateZone(discipline.key, zone, { startMinutes })
                  }
                  onPeakChange={(peakMinutes) =>
                    updateZone(discipline.key, zone, { peakMinutes })
                  }
                  onRateChange={(ratePercent) =>
                    updateZone(discipline.key, zone, { ratePercent })
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" disabled={saving} onClick={onRecalculate}>
        Recalculate zone minutes
      </Button>
      <p className="text-xs text-zinc-500">
        Zone minutes ramp in parallel with volume. Edit minutes directly in the weekly table; those
        weeks are preserved on recalculate.
      </p>
    </div>
  );
}

function RaceSection({
  aRace,
  bRaces,
  cRaces,
  unlinkedCalendarRaces,
  disciplineSettings,
  onChange,
  onRemoveRace,
}: {
  aRace: SimpleGoalEvent;
  bRaces: SimpleGoalEvent[];
  cRaces: SimpleGoalEvent[];
  unlinkedCalendarRaces: UnlinkedRaceSession[];
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onChange: (
    a: SimpleGoalEvent,
    b: SimpleGoalEvent[],
    c: SimpleGoalEvent[],
    unlinked: UnlinkedRaceSession[]
  ) => void;
  onRemoveRace: (
    priority: "B" | "C",
    index: number,
    deleteFromCalendar: boolean
  ) => void;
}) {
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
    const next =
      priority === "B"
        ? [...bRaces, { ...draft, priority: "B" as const }]
        : [...cRaces, { ...draft, priority: "C" as const }];
    const unlinked = unlinkedCalendarRaces.filter(
      (item) => item.plannedSessionId !== session.plannedSessionId
    );
    onChange(
      aRace,
      priority === "B" ? next : bRaces,
      priority === "C" ? next : cRaces,
      unlinked
    );
  }

  return (
    <div className="space-y-4">
      <GoalRaceEditor
        priority="A"
        required
        value={aRace}
        onChange={(next) => onChange({ ...next, priority: "A" }, bRaces, cRaces, unlinkedCalendarRaces)}
        disciplineSettings={disciplineSettings}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">B races</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange(aRace, [...bRaces, emptyRace("B")], cRaces, unlinkedCalendarRaces)
            }
          >
            Add B race
          </Button>
        </div>
        {bRaces.length === 0 && (
          <p className="text-sm text-zinc-500">Optional tune-up or secondary-priority races.</p>
        )}
        {bRaces.map((race, index) => (
          <GoalRaceEditor
            key={race.id ?? race.plannedSessionId ?? `b-${index}`}
            priority="B"
            value={race}
            onChange={(next) => {
              const updated = [...bRaces];
              updated[index] = { ...next, priority: "B" };
              onChange(aRace, updated, cRaces, unlinkedCalendarRaces);
            }}
            onRemove={(deleteFromCalendar) => onRemoveRace("B", index, deleteFromCalendar)}
            disciplineSettings={disciplineSettings}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">C races</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange(aRace, bRaces, [...cRaces, emptyRace("C")], unlinkedCalendarRaces)
            }
          >
            Add C race
          </Button>
        </div>
        {cRaces.length === 0 && (
          <p className="text-sm text-zinc-500">Optional low-priority races or training events.</p>
        )}
        {cRaces.map((race, index) => (
          <GoalRaceEditor
            key={race.id ?? race.plannedSessionId ?? `c-${index}`}
            priority="C"
            value={race}
            onChange={(next) => {
              const updated = [...cRaces];
              updated[index] = { ...next, priority: "C" };
              onChange(aRace, bRaces, updated, unlinkedCalendarRaces);
            }}
            onRemove={(deleteFromCalendar) => onRemoveRace("C", index, deleteFromCalendar)}
            disciplineSettings={disciplineSettings}
          />
        ))}
      </div>

      {unlinkedCalendarRaces.length > 0 && (
        <div className="space-y-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">From calendar</p>
          <p className="text-xs text-zinc-500">
            These races are on your calendar but not linked to this season plan yet.
          </p>
          {unlinkedCalendarRaces.map((session) => (
            <div
              key={session.plannedSessionId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">{session.name}</p>
                <p className="text-xs text-zinc-500">
                  {session.date}
                  {session.disciplines.length > 0 &&
                    ` · ${formatGoalDisciplines(session.disciplines)}`}
                  {session.estimatedDurationMinutes != null &&
                    ` · ${formatGoalTimeDisplay(session.estimatedDurationMinutes)}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => importCalendarRace(session, "B")}
                >
                  Add as B
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => importCalendarRace(session, "C")}
                >
                  Add as C
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

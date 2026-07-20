"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { NumberEditorInput, TextEditorInput } from "@/components/number-editor-input";
import { FitnessFatigueChart } from "@/components/fitness-fatigue-chart";
import {
  SimplePlannerPhasesPane,
  type WeeklyTemplateOption,
} from "@/components/simple-planner/simple-planner-phases-pane";
import { templateCategoryLabel } from "@/lib/plan/calendar/template-category";
import { SimplePlannerTimeline } from "@/components/simple-planner/simple-planner-timeline";
import { SimplePlannerWeekTable } from "@/components/simple-planner/simple-planner-week-table";
import {
  emptyRace,
  DEFAULT_PHASE_SESSIONS,
  DEFAULT_PHASE_INTENSE_DAYS,
  type SimpleGoalEvent,
  type SimplePhase,
  type SimpleSeason,
  type SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
import { defaultSimpleRampDefaults, type SimpleRampDefaults } from "@/lib/plan/season/simple-ramp";
import { DEFAULT_REST_VOLUME_PERCENT } from "@/lib/plan/season/constants";
import { defaultPhaseKindZoneDefaults } from "@/lib/plan/season/phase-zone-defaults";
import { PLANNING_MODE_LABELS, PLANNING_MODES } from "@/lib/plan/season/planning-mode";
import type { PlanningMode } from "@prisma/client";
import { parseZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { PhaseKindZoneDefaultsEditor } from "@/components/simple-planner/zone-split-editor";
import { useDisciplineSettings } from "@/lib/units/use-discipline-settings";
import {
  distanceDisplayToMeters,
  distanceMetersToDisplay,
  hoursFromDisciplineDistance,
  PlannerPaceInput,
} from "@/components/simple-planner/simple-planner-volume-display";
import { applySimpleSeasonDateBounds } from "@/lib/plan/season/simple-season-weeks";
import { resolveLongWeekFlagsForSeason } from "@/lib/plan/season/long-session-schedule";
import {
  DISCIPLINE_LABELS,
  DISCIPLINES,
  sortDisciplines,
  toggleGoalDiscipline,
  type Discipline,
} from "@/lib/plan/season/season-types";

function normalizeSeason(season: SimpleSeason): SimpleSeason {
  const kindDefaults = season.phaseKindZoneDefaults ?? defaultPhaseKindZoneDefaults();
  const longRideWeekFlags = resolveLongWeekFlagsForSeason({
    totalWeeks: season.totalWeeks,
    stored: season.longRideWeekFlags ?? null,
  });
  const longRunWeekFlags = resolveLongWeekFlagsForSeason({
    totalWeeks: season.totalWeeks,
    stored: season.longRunWeekFlags ?? null,
  });
  return {
    ...season,
    deLoadVolumePercent: season.deLoadVolumePercent ?? DEFAULT_REST_VOLUME_PERCENT,
    defaultPlanningMode: season.defaultPlanningMode ?? "BY_DISCIPLINE",
    phaseKindZoneDefaults: kindDefaults,
    longRideWeekFlags,
    longRunWeekFlags,
    phases: season.phases.map((phase) => ({
      ...phase,
      phaseKind: phase.phaseKind ?? "BASE",
      zoneSplits: phase.zoneSplits ?? null,
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
    })),
    weeks: season.weeks.map((week) => ({
      ...week,
      zoneMinutes: week.zoneMinutes ?? {},
    })),
  };
}

type PlannerSectionId =
  | "season"
  | "races"
  | "timeline"
  | "phaseKinds"
  | "phases"
  | "ramps"
  | "weeklyVolume";

const DEFAULT_SECTION_EXPANDED: Record<PlannerSectionId, boolean> = {
  season: true,
  races: false,
  timeline: true,
  phaseKinds: false,
  phases: false,
  ramps: false,
  weeklyVolume: true,
};

function cloneSeason(season: SimpleSeason): SimpleSeason {
  return structuredClone(season);
}

function revertSection(
  sectionId: PlannerSectionId,
  baseline: SimpleSeason,
  draft: SimpleSeason
): SimpleSeason {
  switch (sectionId) {
    case "season":
      return {
        ...draft,
        name: baseline.name,
        startDate: baseline.startDate,
        endDate: baseline.endDate,
        totalWeeks: baseline.totalWeeks,
        weeks: baseline.weeks,
        phases: baseline.phases,
        defaultPlanningMode: baseline.defaultPlanningMode,
      };
    case "races":
      return {
        ...draft,
        primaryGoalEvent: baseline.primaryGoalEvent,
        goalEvents: baseline.goalEvents,
      };
    case "phaseKinds":
      return {
        ...draft,
        phaseKindZoneDefaults: baseline.phaseKindZoneDefaults,
        weeks: baseline.weeks,
      };
    case "phases":
      return {
        ...draft,
        phases: baseline.phases,
        weeks: baseline.weeks,
        longRideWeekFlags: baseline.longRideWeekFlags,
        longRunWeekFlags: baseline.longRunWeekFlags,
        restWeekTemplateId: baseline.restWeekTemplateId,
        testWeekTemplateId: baseline.testWeekTemplateId,
      };
    case "ramps":
      return {
        ...draft,
        rampDefaults: baseline.rampDefaults,
        weeks: baseline.weeks,
      };
    case "weeklyVolume":
      return {
        ...draft,
        weeks: baseline.weeks,
        phases: baseline.phases,
      };
    default:
      return draft;
  }
}

function flushPendingInputs() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
  actions,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  actions?: ReactNode;
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
      {expanded ? (
        <div className="border-t border-zinc-100 px-5 pb-5 pt-4 dark:border-zinc-800">
          {children}
          {actions ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SectionActions({
  onSave,
  onCancel,
  saving,
  saveLabel = "Save",
}: {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  return (
    <>
      <Button type="button" disabled={saving} onClick={onSave}>
        {saving ? "Saving…" : saveLabel}
      </Button>
      <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
    </>
  );
}

function buildPrimaryGoalEventPayload(
  aRace: SimpleGoalEvent,
  fallbackDate: string
): { id?: string; name: string; date: string; disciplines: SimpleGoalEvent["disciplines"] } | undefined {
  if (aRace.id) {
    return {
      id: aRace.id,
      name: aRace.name.trim() || "A race",
      date: aRace.date || fallbackDate,
      disciplines: aRace.disciplines.length > 0 ? aRace.disciplines : ["RUN"],
    };
  }
  if (!aRace.name.trim() || !aRace.date) return undefined;
  return {
    id: aRace.id,
    name: aRace.name.trim(),
    date: aRace.date,
    disciplines: aRace.disciplines,
  };
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

export function SimplePlannerView({
  ecoLoadEnabled = false,
}: {
  ecoLoadEnabled?: boolean;
}) {
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const [season, setSeason] = useState<SimpleSeason | null>(null);
  const [baselineSeason, setBaselineSeason] = useState<SimpleSeason | null>(null);
  const [zoneFocusCatalog, setZoneFocusCatalog] = useState<ZoneFocusCatalog>(() =>
    parseZoneFocusCatalog(null)
  );
  const [templates, setTemplates] = useState<WeeklyTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState<PlannerSectionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState(DEFAULT_SECTION_EXPANDED);

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
      ? `/api/plan/season/simple?seasonId=${encodeURIComponent(seasonIdParam)}`
      : "/api/plan/season/simple";
    const res = await fetch(url);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(
        typeof body?.error === "string" ? body.error : "Could not load season plan."
      );
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      season: SimpleSeason | null;
      zoneFocusCatalog?: ZoneFocusCatalog;
    };
    const loaded = data.season ? normalizeSeason(data.season) : null;
    setSeason(loaded);
    setBaselineSeason(loaded ? cloneSeason(loaded) : null);
    setZoneFocusCatalog(parseZoneFocusCatalog(data.zoneFocusCatalog ?? null));
    setCreateMode(!data.season);
    setLoading(false);
  }, [seasonIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/plan/calendar/templates");
      if (!res.ok) return;
      const data = (await res.json()) as {
        templates?: { id: string; name: string; category: WeeklyTemplateOption["category"] }[];
      };
      setTemplates(
        (data.templates ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
        }))
      );
    })();
  }, []);

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

  async function saveSeason(
    payload: Record<string, unknown>,
    options?: { sectionId?: PlannerSectionId }
  ) {
    if (!season) return false;
    flushPendingInputs();
    await new Promise((resolve) => setTimeout(resolve, 0));

    setSaving(true);
    if (options?.sectionId) {
      setSavingSection(options.sectionId);
    }
    setError(null);
    const res = await fetch(`/api/plan/season/${season.id}/simple`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setSavingSection(null);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(typeof body.error === "string" ? body.error : "Save failed.");
      return false;
    }
    const data = (await res.json()) as {
      season: SimpleSeason;
      zoneFocusCatalog?: ZoneFocusCatalog;
    };
    const normalized = normalizeSeason(data.season);
    setSeason(normalized);
    setBaselineSeason(cloneSeason(normalized));
    setZoneFocusCatalog(parseZoneFocusCatalog(data.zoneFocusCatalog ?? null));
    return true;
  }

  function sectionSavePayload(
    sectionId: PlannerSectionId,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> {
    if (!season) return extra;
    const aRace = season.primaryGoalEvent ?? racesByPriority.a;
    const bRaces = season.goalEvents.filter((event) => event.priority === "B");
    const cRaces = season.goalEvents.filter((event) => event.priority === "C");

    switch (sectionId) {
      case "season":
        return {
          name: season.name,
          startDate: season.startDate,
          endDate: season.endDate,
          defaultPlanningMode: season.defaultPlanningMode,
          recalculate: true,
          ...extra,
        };
      case "races":
        return {
          goalEvent: buildPrimaryGoalEventPayload(aRace, season.endDate),
          bGoalEvents: bRaces
            .filter((race) => race.name && race.date)
            .map(({ id, name, date, disciplines }) => ({
              id,
              name,
              date,
              disciplines,
            })),
          cGoalEvents: cRaces
            .filter((race) => race.name && race.date)
            .map(({ id, name, date, disciplines }) => ({
              id,
              name,
              date,
              disciplines,
            })),
          ...extra,
        };
      case "phaseKinds":
        return {
          phaseKindZoneDefaults: season.phaseKindZoneDefaults,
          recalculate: true,
          ...extra,
        };
      case "phases":
        return {
          phases: season.phases,
          restWeekTemplateId: season.restWeekTemplateId ?? null,
          testWeekTemplateId: season.testWeekTemplateId ?? null,
          recalculate: true,
          ...extra,
        };
      case "ramps":
        return {
          rampDefaults: season.rampDefaults,
          recalculate: true,
          ...extra,
        };
      case "weeklyVolume":
        return {
          phases: season.phases,
          weeks: serializeWeeksForSave(season.weeks),
          ...extra,
        };
      default:
        return extra;
    }
  }

  function cancelSection(sectionId: PlannerSectionId) {
    if (!season || !baselineSeason) return;
    setSeason(revertSection(sectionId, baselineSeason, season));
    setError(null);
  }

  function sectionActions(
    sectionId: PlannerSectionId,
    saveLabel = "Save"
  ): ReactNode {
    const isSaving = saving && savingSection === sectionId;
    return (
      <SectionActions
        saving={isSaving}
        saveLabel={saveLabel}
        onSave={() => void saveSeason(sectionSavePayload(sectionId), { sectionId })}
        onCancel={() => cancelSection(sectionId)}
      />
    );
  }

  async function handleCreateSeason() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/plan/season/simple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName,
        startDate: draftDates.startDate,
        endDate: draftDates.endDate,
        rampDefaults: defaultSimpleRampDefaults(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string | Record<string, unknown> };
      const message =
        typeof body.error === "string"
          ? body.error
          : "Could not create season.";
      setError(message);
      return;
    }
    const data = (await res.json()) as {
      season: SimpleSeason;
      zoneFocusCatalog?: ZoneFocusCatalog;
    };
    const normalized = normalizeSeason(data.season);
    setSeason(normalized);
    setBaselineSeason(cloneSeason(normalized));
    setZoneFocusCatalog(parseZoneFocusCatalog(data.zoneFocusCatalog ?? null));
    setCreateMode(false);
    setExpandedSections(DEFAULT_SECTION_EXPANDED);
    window.history.replaceState(
      null,
      "",
      `/plan?seasonId=${encodeURIComponent(normalized.id)}`
    );
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
    return {
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      deLoadVolumePercent: season.deLoadVolumePercent,
      defaultPlanningMode: season.defaultPlanningMode,
      rampDefaults: season.rampDefaults,
      phaseKindZoneDefaults: season.phaseKindZoneDefaults,
      phases: season.phases,
      weeks: serializeWeeksForSave(season.weeks),
      longRideWeekFlags: season.longRideWeekFlags,
      longRunWeekFlags: season.longRunWeekFlags,
      restWeekTemplateId: season.restWeekTemplateId ?? null,
      testWeekTemplateId: season.testWeekTemplateId ?? null,
      goalEvent: buildPrimaryGoalEventPayload(aRace, season.endDate),
      bGoalEvents: bRaces
        .filter((race) => race.name && race.date)
        .map(({ id, name, date, disciplines }) => ({
          id,
          name,
          date,
          disciplines,
        })),
      cGoalEvents: cRaces
        .filter((race) => race.name && race.date)
        .map(({ id, name, date, disciplines }) => ({
          id,
          name,
          date,
          disciplines,
        })),
      ...extra,
    };
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
          <Button
            type="button"
            disabled={saving}
            onClick={() => void saveSeason(savePayload())}
          >
            {saving && !savingSection ? "Saving…" : "Save all"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {ecoLoadEnabled ? (
        <Card title="Fitness / fatigue (season TiZ → ECO)">
          <FitnessFatigueChart
            seasonId={season.id}
            draftWeeks={season.weeks.map((week) => ({
              weekStartDate: week.weekStartDate,
              zoneMinutes: week.zoneMinutes,
              isRestWeek: week.isRestWeek,
            }))}
            compact
          />
        </Card>
      ) : null}

      <CollapsibleSection
        title="Season"
        expanded={expandedSections.season}
        onToggle={() => toggleSection("season")}
        actions={sectionActions("season")}
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
          <div>
            <Label>Default planning mode</Label>
            <select
              className="mt-1 w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={season.defaultPlanningMode ?? "BY_DISCIPLINE"}
              onChange={(event) =>
                setSeason({
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
              Phases can override this per block. Modes 3–4 include the long in Sessions per week.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Races"
        expanded={expandedSections.races}
        onToggle={() => toggleSection("races")}
        actions={sectionActions("races")}
      >
        <RaceSection
          aRace={racesByPriority.a}
          bRaces={racesByPriority.b}
          cRaces={racesByPriority.c}
          onChange={(goalEvent, bGoalEvents, cGoalEvents) => {
            setSeason({
              ...season,
              primaryGoalEvent: goalEvent,
              goalEvents: [
                { ...goalEvent, priority: "A" as const },
                ...bGoalEvents.map((event) => ({ ...event, priority: "B" as const })),
                ...cGoalEvents.map((event) => ({ ...event, priority: "C" as const })),
              ],
            });
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
        title="Phase kind zone defaults"
        expanded={expandedSections.phaseKinds}
        onToggle={() => toggleSection("phaseKinds")}
        actions={sectionActions("phaseKinds", "Save & recalculate zones")}
      >
        <PhaseKindZoneDefaultsEditor
          value={season.phaseKindZoneDefaults}
          onChange={(phaseKindZoneDefaults) =>
            setSeason({ ...season, phaseKindZoneDefaults })
          }
          catalog={zoneFocusCatalog}
          showPresetPercents
        />
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/settings" className="text-sky-600 hover:underline">
            Manage focus library and athlete defaults in Settings →
          </Link>
        </p>
      </CollapsibleSection>

      <CollapsibleSection
        title="Phases"
        expanded={expandedSections.phases}
        onToggle={() => toggleSection("phases")}
        actions={sectionActions("phases", "Save & recalculate")}
      >
        <SeasonWeekTemplatePicker
          templates={templates}
          restWeekTemplateId={season.restWeekTemplateId ?? null}
          testWeekTemplateId={season.testWeekTemplateId ?? null}
          onRestChange={(restWeekTemplateId) =>
            setSeason({ ...season, restWeekTemplateId })
          }
          onTestChange={(testWeekTemplateId) =>
            setSeason({ ...season, testWeekTemplateId })
          }
        />
        <SimplePlannerPhasesPane
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
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={setSelectedPhaseId}
          onPhasesChange={(phases) => setSeason({ ...season, phases })}
          onLongRideWeekFlagsChange={(longRideWeekFlags) =>
            setSeason({ ...season, longRideWeekFlags })
          }
          onLongRunWeekFlagsChange={(longRunWeekFlags) =>
            setSeason({ ...season, longRunWeekFlags })
          }
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Ramp defaults"
        expanded={expandedSections.ramps}
        onToggle={() => toggleSection("ramps")}
        actions={sectionActions("ramps", "Save & recalculate volumes")}
      >
        <RampDefaultsEditor
          value={season.rampDefaults}
          disciplineSettings={disciplineSettings}
          onChange={(rampDefaults) => setSeason({ ...season, rampDefaults })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Weekly volume"
        expanded={expandedSections.weeklyVolume}
        onToggle={() => toggleSection("weeklyVolume")}
        actions={sectionActions("weeklyVolume")}
      >
        <div className="mb-4 flex flex-wrap items-end gap-4">
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
                  setSeason({
                    ...season,
                    deLoadVolumePercent: Math.min(100, Math.max(1, next)),
                  });
                }}
              />
              <span className="text-sm text-zinc-500">% of prior training week</span>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => void saveSeason(savePayload({ recalculate: true }))}
          >
            {saving ? "Saving…" : "Save & recalculate volume"}
          </Button>
        </div>
        <SimplePlannerWeekTable
          weeks={season.weeks}
          phases={season.phases}
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

function SeasonWeekTemplatePicker({
  templates,
  restWeekTemplateId,
  testWeekTemplateId,
  onRestChange,
  onTestChange,
}: {
  templates: WeeklyTemplateOption[];
  restWeekTemplateId: string | null;
  testWeekTemplateId: string | null;
  onRestChange: (id: string | null) => void;
  onTestChange: (id: string | null) => void;
}) {
  const selectClass =
    "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-semibold">Season week templates</p>
      <p className="mt-1 text-xs text-zinc-500">
        Reusable layouts applied to this season&apos;s rest/de-load weeks and scheduled test
        weeks. Manage them in the template library.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Rest week template</Label>
          <select
            className={selectClass}
            value={restWeekTemplateId ?? ""}
            onChange={(event) => onRestChange(event.target.value || null)}
          >
            <option value="">None — use phase template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({templateCategoryLabel(template.category)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Test week template</Label>
          <select
            className={selectClass}
            value={testWeekTemplateId ?? ""}
            onChange={(event) => onTestChange(event.target.value || null)}
          >
            <option value="">None</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({templateCategoryLabel(template.category)})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function RampDefaultsEditor({
  value,
  disciplineSettings,
  onChange,
}: {
  value: SimpleRampDefaults;
  disciplineSettings: ReturnType<typeof useDisciplineSettings>["disciplineSettings"];
  onChange: (value: SimpleRampDefaults) => void;
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

  function updatePace(
    key: "swim" | "run",
    paceDiscipline: "SWIM" | "RUN",
    seconds: number
  ) {
    const def = value[key];
    const patch: Partial<SimpleRampDefaults["swim"]> = {
      referencePaceSeconds: seconds,
    };
    if (def.mode === "DISTANCE") {
      patch.startHours = hoursFromDisciplineDistance(
        paceDiscipline,
        def.startDistanceMeters,
        { ...def, referencePaceSeconds: seconds }
      );
      patch.peakHours = hoursFromDisciplineDistance(
        paceDiscipline,
        def.peakDistanceMeters,
        { ...def, referencePaceSeconds: seconds }
      );
    }
    updateDiscipline(key, patch);
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
                      <TextEditorInput
                        inputMode="decimal"
                        className="w-28"
                        value={distanceMetersToDisplay(
                          def.startDistanceMeters,
                          row.paceDiscipline,
                          disciplineSettings
                        )}
                        onCommit={(raw) => {
                          const meters = distanceDisplayToMeters(
                            raw,
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
                      <NumberEditorInput
                        min={0}
                        integer={false}
                        className="w-24"
                        value={def.startHours}
                        onCommit={(v) => {
                          if (v == null) return;
                          updateDiscipline(row.key, { startHours: v });
                        }}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {distanceMode && row.paceDiscipline ? (
                      <TextEditorInput
                        inputMode="decimal"
                        className="w-28"
                        value={distanceMetersToDisplay(
                          def.peakDistanceMeters,
                          row.paceDiscipline,
                          disciplineSettings
                        )}
                        onCommit={(raw) => {
                          const meters = distanceDisplayToMeters(
                            raw,
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
                      <NumberEditorInput
                        min={0}
                        integer={false}
                        className="w-24"
                        value={def.peakHours}
                        onCommit={(v) => {
                          if (v == null) return;
                          updateDiscipline(row.key, { peakHours: v });
                        }}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-1">
                      <NumberEditorInput
                        min={0}
                        max={100}
                        integer={false}
                        className="w-20"
                        value={def.ratePercent}
                        onCommit={(v) => {
                          if (v == null) return;
                          updateDiscipline(row.key, { ratePercent: v });
                        }}
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
                          updatePace(row.key, row.paceDiscipline!, seconds)
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
      <p className="text-xs text-zinc-500">
        Save this section to persist ramp settings and recalculate auto-filled volume weeks.
        Rest weeks and ramp-off phases stay unchanged.
      </p>
    </div>
  );
}

function RaceSection({
  aRace,
  bRaces,
  cRaces,
  onChange,
}: {
  aRace: SimpleGoalEvent;
  bRaces: SimpleGoalEvent[];
  cRaces: SimpleGoalEvent[];
  onChange: (
    a: SimpleGoalEvent,
    b: SimpleGoalEvent[],
    c: SimpleGoalEvent[]
  ) => void;
}) {
  return (
    <div className="space-y-4">
      <RaceEditor
        priority="A"
        value={aRace}
        onChange={(next) => onChange(next, bRaces, cRaces)}
        required
      />
      {bRaces.map((race, index) => (
        <RaceEditor
          key={`b-${index}`}
          priority="B"
          value={race}
          onChange={(next) => {
            const updated = [...bRaces];
            updated[index] = next;
            onChange(aRace, updated, cRaces);
          }}
          onRemove={() => onChange(aRace, bRaces.filter((_, i) => i !== index), cRaces)}
        />
      ))}
      {cRaces.map((race, index) => (
        <RaceEditor
          key={`c-${index}`}
          priority="C"
          value={race}
          onChange={(next) => {
            const updated = [...cRaces];
            updated[index] = next;
            onChange(aRace, bRaces, updated);
          }}
          onRemove={() => onChange(aRace, bRaces, cRaces.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange(aRace, [...bRaces, emptyRace("B")], cRaces)}
        >
          Add B race
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange(aRace, bRaces, [...cRaces, emptyRace("C")])}
        >
          Add C race
        </Button>
      </div>
    </div>
  );
}

function RaceEditor({
  priority,
  value,
  onChange,
  onRemove,
  required,
}: {
  priority: "A" | "B" | "C";
  value: SimpleGoalEvent;
  onChange: (next: SimpleGoalEvent) => void;
  onRemove?: () => void;
  required?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{priority}-race</span>
        {onRemove && (
          <button type="button" className="text-sm text-zinc-500 hover:text-red-600" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Name{required ? " *" : ""}</Label>
          <Input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </div>
        <div>
          <Label>Date{required ? " *" : ""}</Label>
          <Input
            type="date"
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label>Disciplines</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {DISCIPLINES.map((discipline) => {
            const active = value.disciplines.includes(discipline);
            return (
              <button
                key={discipline}
                type="button"
                onClick={() => {
                  const next = toggleGoalDiscipline(value.disciplines, discipline);
                  if (next) onChange({ ...value, disciplines: next });
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active
                    ? "bg-sky-600 text-white"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {DISCIPLINE_LABELS[discipline]}
              </button>
            );
          })}
        </div>
        {value.disciplines.length > 0 && (
          <p className="mt-1 text-xs text-zinc-500">
            {sortDisciplines(value.disciplines as Discipline[])
              .map((d) => DISCIPLINE_LABELS[d])
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

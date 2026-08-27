"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { NumberEditorInput } from "@/components/number-editor-input";
import { FitnessFatigueChart } from "@/components/fitness-fatigue-chart";
import {
  SimplePlannerPhasesPane,
  type WeeklyTemplateOption,
} from "@/components/simple-planner/simple-planner-phases-pane";
import { templateCategoryLabel } from "@/lib/plan/calendar/template-category";
import { resolveTestWeekFlagsForSeason } from "@/lib/plan/calendar/week-template-resolution";
import { SimplePlannerTimeline } from "@/components/simple-planner/simple-planner-timeline";
import { SimplePlannerTrainingPlanPane } from "@/components/simple-planner/simple-planner-training-plan-pane";
import { SimplePlannerWeekTable } from "@/components/simple-planner/simple-planner-week-table";
import {
  previewAttachedPrograms,
  type AttachedPlanSessionDraft,
} from "@/lib/plan/season/preview-attached-plan";
import { mondayWeekStartKey } from "@/lib/dates";
import { shiftProgramAttachmentByWeeks } from "@/lib/plan/training-plan";
import {
  emptyRace,
  DEFAULT_PHASE_SESSIONS,
  DEFAULT_PHASE_INTENSE_DAYS,
  type SimpleGoalEvent,
  type SimpleSeason,
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
  hoursFromDisciplineDistance,
  PlannerPaceInput,
} from "@/components/simple-planner/simple-planner-volume-display";
import { applySimpleSeasonDateBounds } from "@/lib/plan/season/simple-season-weeks";
import { resolveLongWeekFlagsForSeason } from "@/lib/plan/season/long-session-schedule";
import { previewPhaseAwareVolumes } from "@/lib/plan/season/preview-phase-volumes";
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
  const testWeekFlags = resolveTestWeekFlagsForSeason({
    totalWeeks: season.totalWeeks,
    stored: season.testWeekFlags ?? null,
  });
  const base: SimpleSeason = {
    ...season,
    testWeekFlags,
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
    trainingPlanAttachments:
      season.trainingPlanAttachments ??
      (season.trainingPlanAttachment ? [season.trainingPlanAttachment] : []),
    trainingPlanAttachment:
      season.trainingPlanAttachments?.[0] ?? season.trainingPlanAttachment ?? null,
    planSessionConflicts: season.planSessionConflicts ?? [],
    maxWeekHours: season.maxWeekHours ?? null,
    trainerRoadDriven: Boolean(season.trainerRoadDriven),
  };

  const preview = previewPhaseAwareVolumes({
    weeks: base.weeks,
    phases: base.phases,
    rampDefaults: base.rampDefaults,
    restVolumePercent: base.deLoadVolumePercent,
    seasonDefaultPlanningMode: base.defaultPlanningMode ?? "BY_DISCIPLINE",
  });

  return {
    ...base,
    phases: preview.phases,
    weeks: preview.weeks,
  };
}

function volumePreviewSignature(season: SimpleSeason): string {
  return JSON.stringify({
    planningMode: season.defaultPlanningMode,
    restVolumePercent: season.deLoadVolumePercent,
    rampDefaults: season.rampDefaults,
    restFlags: season.weeks.map((week) => week.isRestWeek),
    phases: season.phases.map((phase) => ({
      id: phase.id,
      startWeekIndex: phase.startWeekIndex,
      endWeekIndex: phase.endWeekIndex,
      phaseKind: phase.phaseKind,
      planningMode: phase.planningMode,
      rampEnabled: phase.rampEnabled,
      volumeMesocycleMode: phase.volumeMesocycleMode,
      volumeProgressionMode: phase.volumeProgressionMode,
      volumeStartHours: phase.volumeStartHours,
      volumeEndHours: phase.volumeEndHours,
      volumeRampPercent: phase.volumeRampPercent,
      volumeStepHours: phase.volumeStepHours,
      swimStartHours: phase.swimStartHours,
      swimEndHours: phase.swimEndHours,
      swimRampPercent: phase.swimRampPercent,
      swimStepHours: phase.swimStepHours,
      bikeStartHours: phase.bikeStartHours,
      bikeEndHours: phase.bikeEndHours,
      bikeRampPercent: phase.bikeRampPercent,
      bikeStepHours: phase.bikeStepHours,
      runStartHours: phase.runStartHours,
      runEndHours: phase.runEndHours,
      runRampPercent: phase.runRampPercent,
      runStepHours: phase.runStepHours,
    })),
  });
}

type PlannerSectionId =
  | "season"
  | "races"
  | "trainingPlan"
  | "phases"
  | "seasonDefaults"
  | "weeklyVolume";

const DEFAULT_SECTION_EXPANDED: Record<PlannerSectionId, boolean> = {
  season: true,
  races: true,
  trainingPlan: true,
  phases: true,
  seasonDefaults: false,
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
        maxWeekHours: baseline.maxWeekHours,
      };
    case "races":
      return {
        ...draft,
        primaryGoalEvent: baseline.primaryGoalEvent,
        goalEvents: baseline.goalEvents,
      };
    case "trainingPlan":
      return {
        ...draft,
        trainingPlanAttachments: baseline.trainingPlanAttachments,
        trainingPlanAttachment: baseline.trainingPlanAttachment,
        planSessionConflicts: baseline.planSessionConflicts,
        weeks: baseline.weeks,
      };
    case "seasonDefaults":
      return {
        ...draft,
        phaseKindZoneDefaults: baseline.phaseKindZoneDefaults,
        rampDefaults: baseline.rampDefaults,
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
    case "weeklyVolume":
      return {
        ...draft,
        weeks: baseline.weeks,
        phases: baseline.phases,
        testWeekFlags: baseline.testWeekFlags,
        deLoadVolumePercent: baseline.deLoadVolumePercent,
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
  initialCreate = false,
}: {
  ecoLoadEnabled?: boolean;
  initialCreate?: boolean;
}) {
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const createRequested = initialCreate || searchParams.get("new") === "1";
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
  const phaseWorkspaceRef = useRef<HTMLDivElement>(null);

  const toggleSection = useCallback((sectionId: PlannerSectionId) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const handleSelectPhase = useCallback((phaseId: string | null) => {
    setSelectedPhaseId(phaseId);
    if (!phaseId) return;
    setExpandedSections((current) =>
      current.phases ? current : { ...current, phases: true }
    );
    requestAnimationFrame(() => {
      phaseWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const [createMode, setCreateMode] = useState(false);
  const [draftName, setDraftName] = useState("2026 Season");
  const [draftDates, setDraftDates] = useState(defaultSeasonDates);
  const [draftFollowTrainerRoad, setDraftFollowTrainerRoad] = useState(false);
  const [draftARace, setDraftARace] = useState(() => emptyRace("A"));
  const [trainerRoadCalendarSaved, setTrainerRoadCalendarSaved] = useState(false);
  const [followTrainerRoadBusy, setFollowTrainerRoadBusy] = useState(false);
  const [volumePreviewDirty, setVolumePreviewDirty] = useState(false);
  const lastVolumeSignatureRef = useRef<string | null>(null);
  const seasonRef = useRef(season);
  seasonRef.current = season;
  const [libraryPlans, setLibraryPlans] = useState<
    Array<{ id: string; name: string; durationDays: number; sessionCount: number }>
  >([]);
  const [attachedPlanSessionsById, setAttachedPlanSessionsById] = useState<
    Record<string, AttachedPlanSessionDraft[]>
  >({});

  const volumeSignature = season ? volumePreviewSignature(season) : null;

  useEffect(() => {
    if (!volumeSignature) return;
    if (lastVolumeSignatureRef.current === volumeSignature) return;
    const current = seasonRef.current;
    if (!current) return;
    lastVolumeSignatureRef.current = volumeSignature;

    startTransition(() => {
      const preview = previewPhaseAwareVolumes({
        weeks: current.weeks,
        phases: current.phases,
        rampDefaults: current.rampDefaults,
        restVolumePercent: current.deLoadVolumePercent,
        seasonDefaultPlanningMode: current.defaultPlanningMode ?? "BY_DISCIPLINE",
      });
      setVolumePreviewDirty(true);
      setSeason((draft) => {
        if (!draft) return draft;
        return {
          ...draft,
          phases: preview.migrated ? preview.phases : draft.phases,
          weeks: preview.weeks,
        };
      });
    });
  }, [volumeSignature]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = seasonIdParam
      ? `/api/plan/season/simple?seasonId=${encodeURIComponent(seasonIdParam)}`
      : "/api/plan/season/simple";
    const [trRes, seasonRes] = await Promise.all([
      fetch("/api/settings/trainerroad"),
      fetch(url),
    ]);
    if (!seasonRes.ok) {
      const body = (await seasonRes.json().catch(() => null)) as { error?: string } | null;
      setError(
        typeof body?.error === "string" ? body.error : "Could not load season plan."
      );
      setLoading(false);
      return;
    }
    const data = (await seasonRes.json()) as {
      season: SimpleSeason | null;
      zoneFocusCatalog?: ZoneFocusCatalog;
      trainerRoadCalendarSaved?: boolean;
    };
    const trData = trRes.ok
      ? ((await trRes.json()) as { url?: string | null })
      : null;
    const calendarSaved = Boolean(trData?.url) || Boolean(data.trainerRoadCalendarSaved);
    const loaded =
      createRequested || !data.season ? null : normalizeSeason(data.season);
    lastVolumeSignatureRef.current = loaded ? volumePreviewSignature(loaded) : null;
    setVolumePreviewDirty(false);
    setSeason(loaded);
    setBaselineSeason(loaded ? cloneSeason(loaded) : null);
    setZoneFocusCatalog(parseZoneFocusCatalog(data.zoneFocusCatalog ?? null));
    setTrainerRoadCalendarSaved(calendarSaved);
    if (calendarSaved && (createRequested || !data.season)) {
      setDraftFollowTrainerRoad(true);
    }
    setCreateMode(createRequested || !data.season);
    setLoading(false);
  }, [seasonIdParam, createRequested]);

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

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/plan/training-plans");
      if (!res.ok) return;
      const data = (await res.json()) as {
        plans?: Array<{
          id: string;
          name: string;
          durationDays: number;
          sessionCount: number;
        }>;
      };
      setLibraryPlans(data.plans ?? []);
    })();
  }, []);

  const attachedPlanIds = (season?.trainingPlanAttachments ??
    (season?.trainingPlanAttachment ? [season.trainingPlanAttachment] : []))
    .map((row) => row.trainingPlanId)
    .sort()
    .join(",");

  useEffect(() => {
    const ids = attachedPlanIds ? attachedPlanIds.split(",").filter(Boolean) : [];
    if (ids.length === 0) {
      setAttachedPlanSessionsById({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const res = await fetch(`/api/plan/training-plans/${id}`);
          if (!res.ok) return [id, []] as const;
          const data = (await res.json()) as {
            plan?: { sessions?: AttachedPlanSessionDraft[] };
          };
          return [id, data.plan?.sessions ?? []] as const;
        })
      );
      if (cancelled) return;
      setAttachedPlanSessionsById(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [attachedPlanIds]);

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

  const attachedPlanPreview = useMemo(() => {
    const attachments = season?.trainingPlanAttachments?.length
      ? season.trainingPlanAttachments
      : season?.trainingPlanAttachment
        ? [season.trainingPlanAttachment]
        : [];
    if (!season || attachments.length === 0) {
      return {
        weeks: season?.weeks ?? [],
        windows: [] as Array<{
          attachmentId: string;
          window: import("@/lib/plan/training-plan").ApplyWindowWithPausesResult;
          extension: import("@/lib/plan/training-plan").SeasonDateExtension | null;
        }>,
        clashes: [],
        overlaySessions: [],
      };
    }
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return previewAttachedPrograms(
      season.weeks,
      attachments,
      attachedPlanSessionsById,
      todayKey,
      {
        conflicts: season.planSessionConflicts ?? [],
        seasonStart: season.startDate,
        seasonEnd: season.endDate,
      }
    );
  }, [season, attachedPlanSessionsById]);

  const seasonAttachments = season?.trainingPlanAttachments?.length
    ? season.trainingPlanAttachments
    : season?.trainingPlanAttachment
      ? [season.trainingPlanAttachment]
      : [];

  const windowsByAttachmentId = useMemo(() => {
    const out: Record<
      string,
      {
        window: import("@/lib/plan/training-plan").ApplyWindowWithPausesResult;
        extension: import("@/lib/plan/training-plan").SeasonDateExtension | null;
      }
    > = {};
    for (const row of attachedPlanPreview.windows) {
      out[row.attachmentId] = { window: row.window, extension: row.extension };
    }
    return out;
  }, [attachedPlanPreview.windows]);

  const maxHoursExceeded = Boolean(
    season?.maxWeekHours &&
      attachedPlanPreview.weeks.some((week) => week.totalHours > (season.maxWeekHours ?? 0))
  );

  function attachmentWrites(rows = seasonAttachments) {
    return rows.map((row) => ({
      id: row.id,
      trainingPlanId: row.trainingPlanId,
      anchorMode: row.anchorMode,
      anchorDate: row.anchorDate,
      goalEventId: row.goalEventId,
      pausedWeeks: row.pausedWeeks,
      ownsDisciplines: row.ownsDisciplines,
      fillLeftoverTiz: row.fillLeftoverTiz,
      unattachedOverlapMode: row.unattachedOverlapMode,
    }));
  }

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
    lastVolumeSignatureRef.current = volumePreviewSignature(normalized);
    setVolumePreviewDirty(false);
    setSeason(normalized);
    setBaselineSeason(cloneSeason(normalized));
    setZoneFocusCatalog(parseZoneFocusCatalog(data.zoneFocusCatalog ?? null));
    return true;
  }

  async function removeAttachedProgram(index: number) {
    if (!season || saving) return;
    const removed = seasonAttachments[index];
    if (!removed) return;
    const previous = season;
    const trainingPlanAttachments = seasonAttachments.filter((_, i) => i !== index);
    const planSessionConflicts = (season.planSessionConflicts ?? []).filter(
      (row) => !removed.id || row.losingAttachmentId !== removed.id
    );
    setSeason({
      ...season,
      trainingPlanAttachments,
      trainingPlanAttachment: trainingPlanAttachments[0] ?? null,
      planSessionConflicts,
    });
    const ok = await saveSeason(
      {
        trainingPlanAttachments: attachmentWrites(trainingPlanAttachments),
        planSessionConflicts,
        startDate: season.startDate,
        endDate: season.endDate,
        recalculate: true,
      },
      { sectionId: "trainingPlan" }
    );
    if (!ok) {
      setSeason(previous);
    }
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
          maxWeekHours: season.maxWeekHours ?? null,
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
      case "trainingPlan":
        return {
          trainingPlanAttachments: attachmentWrites(),
          planSessionConflicts: season.planSessionConflicts ?? [],
          startDate: season.startDate,
          endDate: season.endDate,
          recalculate: true,
          ...extra,
        };
      case "seasonDefaults":
        return {
          phaseKindZoneDefaults: season.phaseKindZoneDefaults,
          rampDefaults: season.rampDefaults,
          recalculate: true,
          ...extra,
        };
      case "phases":
        return {
          phases: season.phases,
          restWeekTemplateId: season.restWeekTemplateId ?? null,
          testWeekTemplateId: season.testWeekTemplateId ?? null,
          longRideWeekFlags: season.longRideWeekFlags,
          longRunWeekFlags: season.longRunWeekFlags,
          recalculate: true,
          ...extra,
        };
      case "weeklyVolume":
        return {
          phases: season.phases,
          weeks: serializeWeeksForSave(season.weeks),
          testWeekFlags: season.testWeekFlags,
          deLoadVolumePercent: season.deLoadVolumePercent,
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
    if (draftFollowTrainerRoad) {
      if (!trainerRoadCalendarSaved) {
        setSaving(false);
        setError("Save a TrainerRoad calendar URL in Settings first.");
        return;
      }
      if (!draftARace.name.trim() || !draftARace.date) {
        setSaving(false);
        setError("A Race name and date are required to follow TrainerRoad phases.");
        return;
      }
    }
    const res = await fetch("/api/plan/season/simple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName,
        startDate: draftDates.startDate,
        endDate: draftDates.endDate,
        rampDefaults: defaultSimpleRampDefaults(),
        ...(draftFollowTrainerRoad
          ? {
              trainerRoadDriven: true,
              goalEvent: {
                name: draftARace.name.trim(),
                date: draftARace.date,
                disciplines:
                  draftARace.disciplines.length > 0
                    ? draftARace.disciplines
                    : ["SWIM", "BIKE", "RUN"],
              },
            }
          : {}),
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
    lastVolumeSignatureRef.current = volumePreviewSignature(normalized);
    setVolumePreviewDirty(false);
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

  async function patchTrainerRoadDriven(driven: boolean) {
    if (!season) return;
    const aRace = season.primaryGoalEvent ?? racesByPriority.a;
    if (driven && (!aRace.name.trim() || !aRace.date)) {
      setError("Add an A Race (name and date) before following TrainerRoad phases.");
      setExpandedSections((current) => ({ ...current, races: true }));
      return;
    }
    setFollowTrainerRoadBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plan/season/${encodeURIComponent(season.id)}/simple`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          driven
            ? {
                trainerRoadDriven: true,
                goalEvent: {
                  id: aRace.id,
                  name: aRace.name.trim(),
                  date: aRace.date,
                  disciplines:
                    aRace.disciplines.length > 0 ? aRace.disciplines : ["SWIM", "BIKE", "RUN"],
                },
              }
            : { trainerRoadDriven: false }
        ),
      });
      const body = (await res.json()) as {
        error?: string | Record<string, unknown>;
        season?: SimpleSeason;
        zoneFocusCatalog?: ZoneFocusCatalog;
      };
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not update TrainerRoad link.");
        return;
      }
      if (!body.season) return;
      const normalized = normalizeSeason(body.season);
      lastVolumeSignatureRef.current = volumePreviewSignature(normalized);
      setVolumePreviewDirty(false);
      setSeason(normalized);
      setBaselineSeason(cloneSeason(normalized));
      if (body.zoneFocusCatalog) {
        setZoneFocusCatalog(parseZoneFocusCatalog(body.zoneFocusCatalog));
      }
    } finally {
      setFollowTrainerRoadBusy(false);
    }
  }

  const { disciplineSettings } = useDisciplineSettings();

  function serializeWeeksForSave(weeks: SimpleSeason["weeks"]) {
    return weeks.map(
      ({
        weekStartDate: _d,
        totalHours: _t,
        planCoverage: _p,
        planCoverages: _c,
        ownedDisciplines: _o,
        programSessionCounts: _s,
        programIntenseCounts: _i,
        programHasLongRide: _lr,
        programHasLongRun: _ln,
        hasPlanClash: _h,
        strengthHours: _sh,
        strengthSessions: _ss,
        ...week
      }) => week
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
      testWeekFlags: season.testWeekFlags,
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
      trainingPlanAttachments: attachmentWrites(),
      planSessionConflicts: season.planSessionConflicts ?? [],
      maxWeekHours: season.maxWeekHours ?? null,
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
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={draftFollowTrainerRoad}
                  disabled={!trainerRoadCalendarSaved}
                  onChange={(event) => setDraftFollowTrainerRoad(event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-zinc-900 dark:text-zinc-100">
                    Follow TrainerRoad phases
                  </span>
                  {!trainerRoadCalendarSaved ? (
                    <span className="mt-1 block text-xs text-zinc-500">
                      Save a calendar URL in{" "}
                      <Link href="/settings/integrations" className="text-sky-600 hover:underline">
                        Settings → Integrations
                      </Link>{" "}
                      first, then this season can import bike phases from the feed.
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-zinc-500">
                      Imports TrainerRoad phases that fall between the start and end dates.
                      Requires an A Race.
                    </span>
                  )}
                </span>
              </label>
              {draftFollowTrainerRoad ? (
                <div className="mt-4">
                  <RaceEditor
                    priority="A"
                    value={draftARace}
                    onChange={setDraftARace}
                    required
                  />
                </div>
              ) : null}
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
            href="/library/training-plans"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Programs
          </Link>
          <Link
            href="/plan/seasons"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            All seasons
          </Link>
          <Link
            href="/plan?new=1"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            New season
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

      <SimplePlannerTimeline
        sticky
        seasonStart={season.startDate}
        weeks={attachedPlanPreview.weeks}
        phases={season.phases}
        goalEvents={season.goalEvents}
        primaryGoalEvent={season.primaryGoalEvent}
        selectedWeekIndex={selectedWeekIndex}
        onSelectWeek={handleSelectWeek}
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
          setSeason({
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
          setSeason({
            ...season,
            trainingPlanAttachments: seasonAttachments.map((row) =>
              row.pausedWeeks.some((pause) => pause.weekStartDate === monday)
                ? row
                : {
                    ...row,
                    pausedWeeks: [
                      ...row.pausedWeeks,
                      { weekStartDate: monday, weekCount: 1 },
                    ],
                  }
            ),
          });
        }}
        previewHint={
          volumePreviewDirty
            ? "Live preview — Save & recalculate to persist volume"
            : null
        }
      />

      {ecoLoadEnabled ? (
        <Card title="Fitness / fatigue (season TiZ → ECO)">
          <FitnessFatigueChart
            seasonId={season.id}
            draftWeeks={attachedPlanPreview.weeks.map((week) => ({
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
          <div>
            <Label>Max hours per week</Label>
            <NumberEditorInput
              nullable
              integer={false}
              min={1}
              className="mt-1 max-w-xs"
              value={season.maxWeekHours ?? null}
              onCommit={(maxWeekHours) => setSeason({ ...season, maxWeekHours })}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Optional cap. The planner warns when a week’s total exceeds it.
            </p>
            {maxHoursExceeded ? (
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                At least one week is above the max hours per week ({season.maxWeekHours}).
              </p>
            ) : null}
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
        title="Programs"
        expanded={expandedSections.trainingPlan}
        onToggle={() => toggleSection("trainingPlan")}
        actions={sectionActions("trainingPlan", "Save & apply")}
      >
        <SimplePlannerTrainingPlanPane
          attachments={seasonAttachments}
          plans={libraryPlans}
          goalEvents={season.goalEvents}
          weeks={season.weeks}
          selectedWeekIndex={selectedWeekIndex}
          windowsByAttachmentId={windowsByAttachmentId}
          clashes={attachedPlanPreview.clashes}
          conflicts={season.planSessionConflicts ?? []}
          sessionsByPlanId={attachedPlanSessionsById}
          onChange={(trainingPlanAttachments) =>
            setSeason((current) =>
              current
                ? {
                    ...current,
                    trainingPlanAttachments,
                    trainingPlanAttachment: trainingPlanAttachments[0] ?? null,
                  }
                : current
            )
          }
          onConflictsChange={(planSessionConflicts) =>
            setSeason((current) =>
              current ? { ...current, planSessionConflicts } : current
            )
          }
          onRemove={(index) => void removeAttachedProgram(index)}
          busy={saving}
          onPauseAllThisWeek={() => {
            const monday =
              selectedWeekIndex != null
                ? mondayWeekStartKey(
                    season.weeks[selectedWeekIndex]?.weekStartDate ?? ""
                  )
                : null;
            if (!monday) return;
            setSeason({
              ...season,
              trainingPlanAttachments: seasonAttachments.map((row) =>
                row.pausedWeeks.some((pause) => pause.weekStartDate === monday)
                  ? row
                  : {
                      ...row,
                      pausedWeeks: [
                        ...row.pausedWeeks,
                        { weekStartDate: monday, weekCount: 1 },
                      ],
                    }
              ),
            });
          }}
          onExtendSeason={(extension) =>
            setSeason((current) =>
              current
                ? normalizeSeason({
                    ...current,
                    ...applySimpleSeasonDateBounds({
                      startDate: extension.startDate ?? current.startDate,
                      endDate: extension.endDate ?? current.endDate,
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
      </CollapsibleSection>

      <CollapsibleSection
        title="Phases"
        expanded={expandedSections.phases}
        onToggle={() => toggleSection("phases")}
        actions={sectionActions("phases", "Save & recalculate")}
      >
        <div ref={phaseWorkspaceRef} className="space-y-4">
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
            seasonId={season.id}
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
            onSelectPhase={handleSelectPhase}
            onPhasesChange={(phases) => setSeason({ ...season, phases })}
            onLongRideWeekFlagsChange={(longRideWeekFlags) =>
              setSeason({ ...season, longRideWeekFlags })
            }
            onLongRunWeekFlagsChange={(longRunWeekFlags) =>
              setSeason({ ...season, longRunWeekFlags })
            }
            longRideOwnedByProgram={attachedPlanPreview.weeks.map(
              (week) => Boolean(week.programHasLongRide)
            )}
            longRunOwnedByProgram={attachedPlanPreview.weeks.map(
              (week) => Boolean(week.programHasLongRun)
            )}
            programWeekHint={
              selectedWeekIndex != null
                ? attachedPlanPreview.weeks[selectedWeekIndex] ?? null
                : null
            }
            trainerRoadDriven={Boolean(season.trainerRoadDriven)}
            trainerRoadCalendarSaved={trainerRoadCalendarSaved}
            trainerRoadBusy={followTrainerRoadBusy}
            onFollowTrainerRoad={() => void patchTrainerRoadDriven(true)}
            onStopFollowingTrainerRoad={() => void patchTrainerRoadDriven(false)}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Season defaults"
        expanded={expandedSections.seasonDefaults}
        onToggle={() => toggleSection("seasonDefaults")}
        actions={sectionActions("seasonDefaults", "Save & recalculate")}
      >
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Phase kind zone defaults
            </p>
            <PhaseKindZoneDefaultsEditor
              value={season.phaseKindZoneDefaults}
              onChange={(phaseKindZoneDefaults) =>
                setSeason({ ...season, phaseKindZoneDefaults })
              }
              catalog={zoneFocusCatalog}
              showPresetPercents
            />
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/settings/training" className="text-sky-600 hover:underline">
                Manage focus library and athlete defaults in Settings →
              </Link>
            </p>
          </div>
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Planning units
            </p>
            <p className="mb-3 text-xs text-zinc-500">
              Hours vs distance mode and reference paces for swim/run translation.
              Weekly volume growth is set per phase.
            </p>
            <SeasonUnitsEditor
              value={season.rampDefaults}
              disciplineSettings={disciplineSettings}
              onChange={(rampDefaults) => setSeason({ ...season, rampDefaults })}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Week review"
        expanded={expandedSections.weeklyVolume}
        onToggle={() => toggleSection("weeklyVolume")}
        actions={sectionActions("weeklyVolume")}
      >
        <p className="mb-3 text-xs text-zinc-500">
          Inspect and tweak per-week volume here. Create and edit phases (name, targets, intensity)
          in the Phases section above — use + in the gutter as a shortcut to place a phase.
        </p>
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
          weeks={attachedPlanPreview.weeks}
          phases={season.phases}
          testWeekFlags={season.testWeekFlags ?? []}
          onTestWeekFlagsChange={(testWeekFlags) => setSeason({ ...season, testWeekFlags })}
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={handleSelectPhase}
          highlightedWeekIndex={selectedWeekIndex}
          phasesLocked={Boolean(season.trainerRoadDriven)}
          onWeeksChange={(nextWeeks) => {
            const nextByIndex = new Map(
              nextWeeks.map((week) => [week.weekIndex, week])
            );
            const newlyRested = season.weeks.filter((week) => {
              const next = nextByIndex.get(week.weekIndex);
              return Boolean(next?.isRestWeek && !week.isRestWeek);
            });
            let attachments = seasonAttachments;
            if (newlyRested.length > 0 && attachments.length > 0) {
              const covered = newlyRested.some((week) => {
                const preview = attachedPlanPreview.weeks[week.weekIndex];
                return preview?.planCoverage === "attached";
              });
              if (
                covered &&
                window.confirm("Also pause attached programs this week?")
              ) {
                const mondays = new Set(
                  newlyRested.map((week) => mondayWeekStartKey(week.weekStartDate))
                );
                attachments = attachments.map((row) => {
                  const extra = [...mondays]
                    .filter(
                      (monday) =>
                        !row.pausedWeeks.some((pause) => pause.weekStartDate === monday)
                    )
                    .map((monday) => ({ weekStartDate: monday, weekCount: 1 }));
                  return extra.length
                    ? { ...row, pausedWeeks: [...row.pausedWeeks, ...extra] }
                    : row;
                });
              }
            }
            setSeason({
              ...season,
              trainingPlanAttachments: attachments,
              weeks: season.weeks.map((week) => {
                const next = nextByIndex.get(week.weekIndex);
                if (!next) return week;
                return { ...week, isRestWeek: next.isRestWeek };
              }),
            });
          }}
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

function SeasonUnitsEditor({
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
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-4">Discipline</th>
            <th className="pb-2 pr-4">Mode</th>
            <th className="pb-2">Reference pace</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const def = value[row.key];
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

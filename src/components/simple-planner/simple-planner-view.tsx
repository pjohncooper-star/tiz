"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type WeeklyTemplateOption } from "@/components/simple-planner/simple-planner-phases-pane";
import { SimplePlannerCreateWizard } from "@/components/simple-planner/simple-planner-create-wizard";
import { SimplePlannerWorkbench } from "@/components/simple-planner/simple-planner-workbench";
import { resolveTestWeekFlagsForSeason } from "@/lib/plan/calendar/week-template-resolution";
import {
  previewAttachedPrograms,
  type AttachedPlanSessionDraft,
} from "@/lib/plan/season/preview-attached-plan";
import {
  DEFAULT_PHASE_INTENSE_DAYS,
  DEFAULT_PHASE_SESSIONS,
  emptyRace,
  type InspectorTarget,
  type SimpleGoalEvent,
  type SimpleSeason,
} from "@/components/simple-planner/simple-planner-types";
import { DEFAULT_REST_VOLUME_PERCENT } from "@/lib/plan/season/constants";
import { defaultPhaseKindZoneDefaults } from "@/lib/plan/season/phase-zone-defaults";
import { parseZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import type { ZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { useDisciplineSettings } from "@/lib/units/use-discipline-settings";
import { resolveLongWeekFlagsForSeason } from "@/lib/plan/season/long-session-schedule";
import { previewPhaseAwareVolumes } from "@/lib/plan/season/preview-phase-volumes";

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
    preserveBikeHours: Boolean(base.trainerRoadDriven),
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

function cloneSeason(season: SimpleSeason): SimpleSeason {
  return structuredClone(season);
}

function flushPendingInputs() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
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

export function SimplePlannerView({
  ecoLoadEnabled = false,
  initialCreate = false,
}: {
  ecoLoadEnabled?: boolean;
  initialCreate?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const createRequested =
    !seasonIdParam && (initialCreate || searchParams.get("new") === "1");
  const [season, setSeason] = useState<SimpleSeason | null>(null);
  const [baselineSeason, setBaselineSeason] = useState<SimpleSeason | null>(null);
  const [zoneFocusCatalog, setZoneFocusCatalog] = useState<ZoneFocusCatalog>(() =>
    parseZoneFocusCatalog(null)
  );
  const [templates, setTemplates] = useState<WeeklyTemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>({ kind: "season" });
  const [createMode, setCreateMode] = useState(false);
  const [trainerRoadCalendarSaved, setTrainerRoadCalendarSaved] = useState(false);
  const [trainerRoadSyncedAt, setTrainerRoadSyncedAt] = useState<string | null>(null);
  const [followTrainerRoadBusy, setFollowTrainerRoadBusy] = useState(false);
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string }>>([]);
  const lastVolumeSignatureRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
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
        preserveBikeHours: Boolean(current.trainerRoadDriven),
      });
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
    if (seasonIdParam && seasonRef.current?.id === seasonIdParam) {
      setCreateMode(false);
      setLoading(false);
      return;
    }
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    const url = seasonIdParam
      ? `/api/plan/season/simple?seasonId=${encodeURIComponent(seasonIdParam)}`
      : "/api/plan/season/simple";
    const [trRes, seasonRes, seasonsRes] = await Promise.all([
      fetch("/api/settings/trainerroad"),
      fetch(url),
      fetch("/api/plan/seasons"),
    ]);
    if (generation !== loadGenerationRef.current) return;
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
      ? ((await trRes.json()) as { url?: string | null; syncedAt?: string | null })
      : null;
    const seasonsData = seasonsRes.ok
      ? ((await seasonsRes.json()) as { seasons?: Array<{ id: string; name: string }> })
      : null;
    if (generation !== loadGenerationRef.current) return;
    const calendarSaved = Boolean(trData?.url) || Boolean(data.trainerRoadCalendarSaved);
    const wantCreateForm = createRequested && !seasonIdParam;
    const loaded =
      wantCreateForm || !data.season ? null : normalizeSeason(data.season);
    lastVolumeSignatureRef.current = loaded ? volumePreviewSignature(loaded) : null;
    setSeason(loaded);
    setBaselineSeason(loaded ? cloneSeason(loaded) : null);
    setZoneFocusCatalog(parseZoneFocusCatalog(data.zoneFocusCatalog ?? null));
    setTrainerRoadCalendarSaved(calendarSaved);
    setTrainerRoadSyncedAt(trData?.syncedAt ?? null);
    setSeasons(seasonsData?.seasons ?? []);
    setInspectorTarget({ kind: "season" });
    setCreateMode(wantCreateForm || !loaded);
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

  async function saveSeason(payload: Record<string, unknown>) {
    if (!season) return false;
    flushPendingInputs();
    await new Promise((resolve) => setTimeout(resolve, 0));

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/plan/season/${season.id}/simple`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
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
    const ok = await saveSeason({
      trainingPlanAttachments: attachmentWrites(trainingPlanAttachments),
      planSessionConflicts,
      startDate: season.startDate,
      endDate: season.endDate,
      recalculate: true,
    });
    if (!ok) {
      setSeason(previous);
    }
  }

  async function handleCreateSeason(payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/plan/season/simple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string | Record<string, unknown> };
      const message =
        typeof body.error === "string" ? body.error : "Could not create season.";
      setError(message);
      return;
    }
    try {
      const data = (await res.json()) as {
        season: SimpleSeason;
        zoneFocusCatalog?: ZoneFocusCatalog;
      };
      if (!data.season?.id) {
        setError("Could not create season.");
        return;
      }
      loadGenerationRef.current += 1;
      const normalized = normalizeSeason(data.season);
      lastVolumeSignatureRef.current = volumePreviewSignature(normalized);
      setSeason(normalized);
      setBaselineSeason(cloneSeason(normalized));
      setZoneFocusCatalog(parseZoneFocusCatalog(data.zoneFocusCatalog ?? null));
      setInspectorTarget({ kind: "season" });
      setCreateMode(false);
      setSeasons((current) =>
        current.some((item) => item.id === normalized.id)
          ? current
          : [...current, { id: normalized.id, name: normalized.name }]
      );
      router.replace(`/plan?seasonId=${encodeURIComponent(normalized.id)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open the new season.");
    }
  }

  async function patchTrainerRoadDriven(driven: boolean) {
    if (!season) return;
    const aRace = season.primaryGoalEvent ?? racesByPriority.a;
    if (driven && (!aRace.name.trim() || !aRace.date)) {
      setError("Add an A Race (name and date) before following TrainerRoad phases.");
      setInspectorTarget({ kind: "race", eventKey: "A-0" });
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

  const dirty = Boolean(
    season && baselineSeason && JSON.stringify(season) !== JSON.stringify(baselineSeason)
  );

  async function refreshTrainerRoadFeed() {
    if (!season?.trainerRoadDriven) return;
    if (dirty) {
      setError("Save or discard changes before refreshing TrainerRoad.");
      return;
    }
    setFollowTrainerRoadBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/trainerroad", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        syncedAt?: string | null;
        season?: { error?: string };
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not refresh TrainerRoad."
        );
        return;
      }
      if (data.syncedAt) setTrainerRoadSyncedAt(data.syncedAt);
      if (data.season?.error) {
        setError(data.season.error);
      }
      const seasonRes = await fetch(
        `/api/plan/season/${encodeURIComponent(season.id)}/simple`
      );
      const body = (await seasonRes.json()) as {
        error?: string;
        season?: SimpleSeason;
        zoneFocusCatalog?: ZoneFocusCatalog;
      };
      if (!seasonRes.ok || !body.season) {
        setError(
          typeof body.error === "string"
            ? body.error
            : "Refreshed the feed, but could not reload the season."
        );
        return;
      }
      const normalized = normalizeSeason(body.season);
      lastVolumeSignatureRef.current = volumePreviewSignature(normalized);
      setSeason(normalized);
      setBaselineSeason(cloneSeason(normalized));
      if (body.zoneFocusCatalog) {
        setZoneFocusCatalog(parseZoneFocusCatalog(body.zoneFocusCatalog));
      }
    } catch {
      setError("Could not refresh TrainerRoad.");
    } finally {
      setFollowTrainerRoadBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading season…</p>;
  }

  if (createMode || !season) {
    return (
      <SimplePlannerCreateWizard
        trainerRoadCalendarSaved={trainerRoadCalendarSaved}
        saving={saving}
        error={error}
        onCreate={(payload) => void handleCreateSeason(payload)}
      />
    );
  }

  return (
    <SimplePlannerWorkbench
      season={season}
      onSeasonChange={setSeason}
      target={inspectorTarget}
      onSelectTarget={setInspectorTarget}
      templates={templates}
      zoneFocusCatalog={zoneFocusCatalog}
      disciplineSettings={disciplineSettings}
      libraryPlans={libraryPlans}
      attachedPlanSessionsById={attachedPlanSessionsById}
      attachedPlanPreview={attachedPlanPreview}
      windowsByAttachmentId={windowsByAttachmentId}
      seasons={seasons}
      trainerRoadCalendarSaved={trainerRoadCalendarSaved}
      trainerRoadBusy={followTrainerRoadBusy}
      trainerRoadSyncedAt={trainerRoadSyncedAt}
      onFollowTrainerRoad={() => void patchTrainerRoadDriven(true)}
      onStopFollowingTrainerRoad={() => void patchTrainerRoadDriven(false)}
      onRefreshTrainerRoad={() => void refreshTrainerRoadFeed()}
      ecoLoadEnabled={ecoLoadEnabled}
      dirty={dirty}
      saving={saving}
      error={error}
      onSave={() => void saveSeason(savePayload({ recalculate: true }))}
      onDiscard={() => {
        if (!baselineSeason) return;
        lastVolumeSignatureRef.current = volumePreviewSignature(baselineSeason);
        setSeason(cloneSeason(baselineSeason));
        setError(null);
      }}
      onRemoveProgram={(index) => void removeAttachedProgram(index)}
    />
  );
}

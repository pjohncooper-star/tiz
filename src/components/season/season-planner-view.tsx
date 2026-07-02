"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui";
import { PlanTizChart } from "@/components/plan-tiz-chart";
import { SeasonPlannerShell } from "@/components/season/season-planner-shell";
import {
  DISCIPLINE_LABELS,
  focusLabel,
  type Discipline,
  type DisciplineFocusDraft,
  type PhaseFocus,
} from "@/components/season/season-settings-types";
import { combinedZoneTotals } from "@/lib/plan/calendar/week-summary";

type WeekData = {
  weekIndex: number;
  weekStartDate: string;
  isDeLoadWeek: boolean;
  totalHours: number;
  swimHours: number;
  bikeHours: number;
  runHours: number;
  zoneMinutes: Record<string, number>;
  swimSessions: number;
  bikeSessions: number;
  runSessions: number;
  longRideMinutes: number;
  longRunMinutes: number;
};

type PhaseData = {
  id: string;
  name: string;
  sortOrder: number;
  weekCount: number;
  phaseKind: string;
  color: string;
  focusMode: "PHASE" | "DISCIPLINE";
  phaseFocus: PhaseFocus | null;
  disciplineFocuses?: DisciplineFocusDraft[];
};

type SeasonDetail = {
  id: string;
  name: string;
  status: string;
  totalWeeks: number;
  startDate: string;
  endDate: string;
  phases: PhaseData[];
  primaryGoalEvent: { name: string; date: string; disciplines: Discipline[] } | null;
  goalEvents?: {
    id: string;
    name: string;
    date: string;
    disciplines: Discipline[];
    priority: "A" | "B" | "C";
    distanceMeters?: number | null;
    estimatedDurationMinutes?: number | null;
    swimGoalMinutes?: number | null;
    bikeGoalMinutes?: number | null;
    runGoalMinutes?: number | null;
  }[];
};

const ZONE_COLORS = ["#e4e4e7", "#93c5fd", "#38bdf8", "#6366f1", "#f59e0b", "#ef4444"];
const TRI_DISCIPLINES: Discipline[] = ["SWIM", "BIKE", "RUN"];

function phaseForWeekIndex(phases: PhaseData[], weekIndex: number): PhaseData | null {
  let cursor = 0;
  for (const phase of [...phases].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (weekIndex >= cursor && weekIndex < cursor + phase.weekCount) {
      return phase;
    }
    cursor += phase.weekCount;
  }
  return null;
}

function formatPhaseFocusSummary(phase: PhaseData): string | null {
  if (phase.focusMode === "DISCIPLINE") {
    const focuses = phase.disciplineFocuses ?? [];
    if (focuses.length === 0) return null;
    return focuses
      .map((df) => `${DISCIPLINE_LABELS[df.discipline]}: ${focusLabel(df.focus)}`)
      .join(" · ");
  }
  if (phase.phaseFocus) {
    return `Focus: ${focusLabel(phase.phaseFocus)}`;
  }
  return null;
}

export function SeasonPlannerView() {
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const [season, setSeason] = useState<SeasonDetail | null>(null);
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = seasonIdParam
      ? `/api/plan/season?seasonId=${encodeURIComponent(seasonIdParam)}`
      : "/api/plan/season";
    const res = await fetch(url);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { season: SeasonDetail & { weeks?: WeekData[] } };
    if (data.season) {
      setSeason(data.season);
      if (data.season.weeks?.length) {
        setWeeks(data.season.weeks);
      } else {
        const weeksRes = await fetch(`/api/plan/season/${data.season.id}/weeks`);
        if (weeksRes.ok) {
          const weeksData = (await weeksRes.json()) as { weeks: WeekData[] };
          setWeeks(weeksData.weeks);
        }
      }
    }
    setLoading(false);
  }, [seasonIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxHours = useMemo(
    () => Math.max(...weeks.map((w) => w.totalHours), 1),
    [weeks]
  );

  const totalPlannedHours = useMemo(
    () => Math.round(weeks.reduce((s, w) => s + w.totalHours, 0) * 10) / 10,
    [weeks]
  );

  const currentWeek = weeks[selectedWeek] ?? null;
  const currentPhase = season ? phaseForWeekIndex(season.phases, selectedWeek) : null;
  const phaseFocusSummary = currentPhase ? formatPhaseFocusSummary(currentPhase) : null;

  const zoneEntries = useMemo(() => {
    if (!currentWeek) return [];
    const totals = combinedZoneTotals(currentWeek.zoneMinutes);
    return totals.map((minutes, i) => ({
      zone: `Z${i + 1}`,
      minutes,
      color: ZONE_COLORS[i] ?? "#e4e4e7",
    }));
  }, [currentWeek]);

  const zoneTotal = zoneEntries.reduce((s, z) => s + z.minutes, 0);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading season…</p>;
  }

  if (!season) {
    return <p className="text-sm text-zinc-500">No season plan found.</p>;
  }

  return (
    <SeasonPlannerShell
      season={{
        id: season.id,
        name: season.name,
        status: season.status,
        totalWeeks: season.totalWeeks,
        startDate: season.startDate,
        endDate: season.endDate,
        totalPlannedHours,
        primaryGoalEvent: season.primaryGoalEvent,
        goalEvents: season.goalEvents,
      }}
    >
      <Card title="Phase timeline">
        <div className="flex h-8 overflow-hidden rounded-md">
          {[...season.phases]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((phase) => (
              <div
                key={phase.id}
                className="flex items-center justify-center text-xs font-medium text-white"
                style={{
                  flex: phase.weekCount,
                  backgroundColor: phase.color,
                }}
                title={`${phase.name} (${phase.weekCount}w)`}
              >
                {phase.weekCount >= 2 ? phase.name : ""}
              </div>
            ))}
        </div>
      </Card>

      <Card title="Weekly volume">
        <div className="flex items-end gap-0.5" style={{ height: "8rem" }}>
          {weeks.map((week) => {
            const phase = phaseForWeekIndex(season.phases, week.weekIndex);
            const heightPct = (week.totalHours / maxHours) * 100;
            return (
              <button
                key={week.weekIndex}
                type="button"
                onClick={() => setSelectedWeek(week.weekIndex)}
                className={`min-w-0 flex-1 rounded-t transition-opacity ${
                  selectedWeek === week.weekIndex ? "ring-2 ring-sky-500 ring-offset-1" : ""
                } ${week.isDeLoadWeek ? "opacity-60" : ""}`}
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: phase?.color ?? "#38bdf8",
                }}
                title={`W${week.weekIndex + 1}: ${week.totalHours}h`}
              />
            );
          })}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Click a bar to inspect that week. Shaded bars are de-load weeks.
        </p>
      </Card>

      {currentWeek && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`Week ${selectedWeek + 1} — ${currentWeek.weekStartDate}`}>
            {currentPhase && (
              <div className="mb-3 space-y-1 text-sm text-zinc-500">
                <p>
                  {currentPhase.name} · {currentPhase.phaseKind.replace("_", " ")}
                  {currentWeek.isDeLoadWeek ? " · De-load" : ""}
                </p>
                {phaseFocusSummary && <p>{phaseFocusSummary}</p>}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-zinc-500">Total</dt>
                <dd className="font-semibold">{currentWeek.totalHours} h</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Sessions</dt>
                <dd className="font-semibold">
                  {currentWeek.swimSessions}S / {currentWeek.bikeSessions}B /{" "}
                  {currentWeek.runSessions}R
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Long ride</dt>
                <dd className="font-semibold">{currentWeek.longRideMinutes} min</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Long run</dt>
                <dd className="font-semibold">{currentWeek.longRunMinutes} min</dd>
              </div>
            </dl>
          </Card>

          <Card title="Discipline split">
            <div className="space-y-3">
              {(
                [
                  ["Swim", currentWeek.swimHours, "#38bdf8"],
                  ["Bike", currentWeek.bikeHours, "#6366f1"],
                  ["Run", currentWeek.runHours, "#22c55e"],
                ] as const
              ).map(([label, hours, color]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{label}</span>
                    <span className="text-zinc-500">{hours.toFixed(1)} h</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(hours / currentWeek.totalHours) * 100}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Intensity distribution">
            {zoneTotal <= 0 ? (
              <p className="text-sm text-zinc-500">No zone data for this week.</p>
            ) : (
              <div className="flex h-24 gap-1">
                {zoneEntries.map((z) => {
                  const heightPct = (z.minutes / zoneTotal) * 100;
                  return (
                    <div key={z.zone} className="flex h-full min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 flex-1 flex-col justify-end">
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: z.color,
                            minHeight: z.minutes > 0 ? 4 : 0,
                          }}
                          title={`${z.zone}: ${Math.round(z.minutes)} min`}
                        />
                      </div>
                      <span className="shrink-0 pt-1 text-center text-[10px] text-zinc-500">
                        {z.zone}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-zinc-500">
              Planned zone minutes across all disciplines.
            </p>
          </Card>

          <Card title="TiZ by discipline">
            <div className="space-y-4">
              {TRI_DISCIPLINES.map((discipline) => (
                <PlanTizChart
                  key={discipline}
                  discipline={discipline}
                  values={currentWeek.zoneMinutes}
                />
              ))}
            </div>
          </Card>
        </div>
      )}
    </SeasonPlannerShell>
  );
}

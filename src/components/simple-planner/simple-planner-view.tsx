"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
import { SimplePlannerPhasesPane } from "@/components/simple-planner/simple-planner-phases-pane";
import { SimplePlannerTimeline } from "@/components/simple-planner/simple-planner-timeline";
import { SimplePlannerWeekTable } from "@/components/simple-planner/simple-planner-week-table";
import {
  emptyRace,
  type SimpleGoalEvent,
  type SimplePhase,
  type SimpleSeason,
  type SimpleWeek,
} from "@/components/simple-planner/simple-planner-types";
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
import {
  DISCIPLINE_LABELS,
  DISCIPLINES,
  sortDisciplines,
  toggleGoalDiscipline,
  type Discipline,
} from "@/components/season/season-settings-types";

function normalizeSeason(season: SimpleSeason): SimpleSeason {
  return {
    ...season,
    zoneRampDefaults: season.zoneRampDefaults ?? defaultZoneRampDefaults(),
    weeks: season.weeks.map((week) => ({
      ...week,
      zoneMinutes: week.zoneMinutes ?? {},
    })),
  };
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

export function SimplePlannerView({ showAdvancedLink }: { showAdvancedLink?: boolean }) {
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const [season, setSeason] = useState<SimpleSeason | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

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
      setError("Could not load season plan.");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { season: SimpleSeason | null };
    setSeason(data.season ? normalizeSeason(data.season) : null);
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
    const res = await fetch(`/api/plan/season/${season.id}/simple`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(typeof body.error === "string" ? body.error : "Save failed.");
      return;
    }
    const data = (await res.json()) as { season: SimpleSeason };
    setSeason(normalizeSeason(data.season));
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
      rampDefaults: season.rampDefaults,
      zoneRampDefaults: season.zoneRampDefaults,
      phases: season.phases,
      weeks: serializeWeeksForSave(season.weeks),
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
          {showAdvancedLink && (
            <Link
              href={`/plan/setup?seasonId=${encodeURIComponent(season.id)}`}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Advanced settings
            </Link>
          )}
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
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card title="Season">
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
      </Card>

      <Card title="Races">
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
      </Card>

      <Card title="Timeline">
        <SimplePlannerTimeline
          seasonStart={season.startDate}
          weeks={season.weeks}
          phases={season.phases}
          goalEvents={season.goalEvents}
          primaryGoalEvent={season.primaryGoalEvent}
          selectedWeekIndex={selectedWeekIndex}
          onSelectWeek={handleSelectWeek}
        />
      </Card>

      <Card title="Phases">
        <SimplePlannerPhasesPane
          phases={season.phases}
          totalWeeks={season.totalWeeks}
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={setSelectedPhaseId}
          onPhasesChange={(phases) => setSeason({ ...season, phases })}
        />
      </Card>

      <Card title="Ramp defaults">
        <RampDefaultsEditor
          value={season.rampDefaults}
          disciplineSettings={disciplineSettings}
          onChange={(rampDefaults) => setSeason({ ...season, rampDefaults })}
          onRecalculate={() => void saveSeason(savePayload({ recalculate: true }))}
          saving={saving}
        />
      </Card>

      <Card title="Zone ramp defaults">
        <ZoneRampDefaultsEditor
          value={season.zoneRampDefaults}
          onChange={(zoneRampDefaults) => setSeason({ ...season, zoneRampDefaults })}
          onRecalculate={() =>
            void saveSeason(savePayload({ recalculate: true, resetZoneOverrides: true }))
          }
          saving={saving}
        />
      </Card>

      <Card title="Weekly volume">
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
      </Card>
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

  return (
    <div className="space-y-4">
      {disciplines.map((discipline) => (
        <div key={discipline.key} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-3 text-sm font-semibold">{discipline.label}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-4">Zone</th>
                  <th className="pb-2 pr-4">Start min</th>
                  <th className="pb-2 pr-4">Peak min</th>
                  <th className="pb-2">Rate / wk</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => {
                  const key = `z${zone}` as const;
                  const row = value[discipline.key][key];
                  return (
                    <tr key={zone} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 pr-4 font-medium">Z{zone}</td>
                      <td className="py-2 pr-4">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          className="w-24"
                          value={row.startMinutes}
                          onChange={(event) =>
                            onChange({
                              ...value,
                              [discipline.key]: {
                                ...value[discipline.key],
                                [key]: {
                                  ...row,
                                  startMinutes: Number(event.target.value),
                                },
                              },
                            })
                          }
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          className="w-24"
                          value={row.peakMinutes}
                          onChange={(event) =>
                            onChange({
                              ...value,
                              [discipline.key]: {
                                ...value[discipline.key],
                                [key]: {
                                  ...row,
                                  peakMinutes: Number(event.target.value),
                                },
                              },
                            })
                          }
                        />
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            className="w-20"
                            value={row.ratePercent}
                            onChange={(event) =>
                              onChange({
                                ...value,
                                [discipline.key]: {
                                  ...value[discipline.key],
                                  [key]: {
                                    ...row,
                                    ratePercent: Number(event.target.value),
                                  },
                                },
                              })
                            }
                          />
                          <span className="text-zinc-500">%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

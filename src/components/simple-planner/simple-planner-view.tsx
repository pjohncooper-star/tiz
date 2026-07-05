"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";
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
  DISCIPLINE_LABELS,
  DISCIPLINES,
  sortDisciplines,
  toggleGoalDiscipline,
  type Discipline,
} from "@/components/season/season-settings-types";

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
    setSeason(data.season);
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
    setSeason(data.season);
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
      const body = (await res.json()) as { error?: string };
      setError(typeof body.error === "string" ? body.error : "Could not create season.");
      return;
    }
    const data = (await res.json()) as { season: SimpleSeason };
    setSeason(data.season);
    setCreateMode(false);
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
            onClick={() => {
              const bRaces = season.goalEvents.filter((event) => event.priority === "B");
              const cRaces = season.goalEvents.filter((event) => event.priority === "C");
              const aRace = season.primaryGoalEvent ?? racesByPriority.a;
              void saveSeason({
                name: season.name,
                startDate: season.startDate,
                endDate: season.endDate,
                rampDefaults: season.rampDefaults,
                phases: season.phases,
                weeks: season.weeks.map(({ weekStartDate: _d, totalHours: _t, ...week }) => week),
                goalEvent:
                  aRace.name && aRace.date
                    ? {
                        id: aRace.id,
                        name: aRace.name,
                        date: aRace.date,
                        disciplines: aRace.disciplines,
                      }
                    : undefined,
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
              });
            }}
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
                onChange={(event) => setSeason({ ...season, startDate: event.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={season.endDate}
                onChange={(event) => setSeason({ ...season, endDate: event.target.value })}
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

      <Card title="Ramp defaults">
        <RampDefaultsEditor
          value={season.rampDefaults}
          onChange={(rampDefaults) => setSeason({ ...season, rampDefaults })}
          onRecalculate={() =>
            void saveSeason({
              rampDefaults: season.rampDefaults,
              phases: season.phases,
              weeks: season.weeks.map(({ weekStartDate: _d, totalHours: _t, ...week }) => week),
              recalculate: true,
            })
          }
          saving={saving}
        />
      </Card>

      <Card title="Weekly volume">
        <SimplePlannerWeekTable
          weeks={season.weeks}
          phases={season.phases}
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
  onChange,
  onRecalculate,
  saving,
}: {
  value: SimpleRampDefaults;
  onChange: (value: SimpleRampDefaults) => void;
  onRecalculate: () => void;
  saving: boolean;
}) {
  const rows = [
    { key: "swim" as const, label: "Swim" },
    { key: "bike" as const, label: "Bike" },
    { key: "run" as const, label: "Run" },
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 pr-4">Discipline</th>
              <th className="pb-2 pr-4">Start h/wk</th>
              <th className="pb-2 pr-4">Peak h/wk</th>
              <th className="pb-2">Rate / wk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="py-2 pr-4 font-medium">{row.label}</td>
                <td className="py-2 pr-4">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-24"
                    value={value[row.key].startHours}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        [row.key]: {
                          ...value[row.key],
                          startHours: Number(event.target.value),
                        },
                      })
                    }
                  />
                </td>
                <td className="py-2 pr-4">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="w-24"
                    value={value[row.key].peakHours}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        [row.key]: {
                          ...value[row.key],
                          peakHours: Number(event.target.value),
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
                      value={value[row.key].ratePercent}
                      onChange={(event) =>
                        onChange({
                          ...value,
                          [row.key]: {
                            ...value[row.key],
                            ratePercent: Number(event.target.value),
                          },
                        })
                      }
                    />
                    <span className="text-zinc-500">%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" disabled={saving} onClick={onRecalculate}>
        Recalculate ramp weeks
      </Button>
      <p className="text-xs text-zinc-500">
        Updates auto-calculated weeks only. Rest weeks and ramp-off phases stay manual.
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

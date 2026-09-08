"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@/components/ui";
import { RaceSection } from "@/components/simple-planner/simple-planner-races";
import { emptyRace, type SimpleGoalEvent } from "@/components/simple-planner/simple-planner-types";
import { suggestSimplePhasesForWeeks } from "@/lib/plan/season/simple-phase-zone-seed";
import { buildSeasonDateBounds } from "@/lib/plan/season/season-dates";
import { parseDateKey, formatDateKey } from "@/lib/dates";
import { defaultSimpleRampDefaults } from "@/lib/plan/season/simple-ramp";

type StructureChoice = "trainerroad" | "suggested" | "empty";
type WizardStep = 1 | 2 | 3;

type PreviewPhase = {
  name: string;
  color: string;
  startWeekIndex: number;
  endWeekIndex: number;
};

function defaultSeasonDates() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 6);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function PhasePreviewStrip({
  phases,
  totalWeeks,
  emptyLabel,
}: {
  phases: PreviewPhase[];
  totalWeeks: number;
  emptyLabel: string;
}) {
  const weeks = Math.max(1, totalWeeks);
  if (phases.length === 0) {
    return (
      <div className="relative h-8 overflow-hidden rounded-md border border-dashed border-zinc-300 dark:border-zinc-700">
        <p className="px-2 py-1.5 text-xs text-zinc-500">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="relative h-8 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
      {phases.map((phase) => {
        if (phase.startWeekIndex < 0) return null;
        const widthPct = ((phase.endWeekIndex - phase.startWeekIndex + 1) / weeks) * 100;
        const leftPct = (phase.startWeekIndex / weeks) * 100;
        return (
          <div
            key={`${phase.name}-${phase.startWeekIndex}`}
            className="absolute inset-y-0 flex items-center overflow-hidden px-1 text-[10px] font-medium text-white"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: phase.color,
            }}
            title={phase.name}
          >
            <span className="truncate">{phase.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function SimplePlannerCreateWizard({
  trainerRoadCalendarSaved,
  saving,
  error,
  onCreate,
}: {
  trainerRoadCalendarSaved: boolean;
  saving: boolean;
  error: string | null;
  onCreate: (payload: Record<string, unknown>) => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState(`${new Date().getFullYear()} Season`);
  const [dates, setDates] = useState(defaultSeasonDates);
  const [aRace, setARace] = useState(() => emptyRace("A"));
  const [bRaces, setBRaces] = useState<SimpleGoalEvent[]>([]);
  const [cRaces, setCRaces] = useState<SimpleGoalEvent[]>([]);
  const [structure, setStructure] = useState<StructureChoice>(
    trainerRoadCalendarSaved ? "trainerroad" : "suggested"
  );
  const [trPreview, setTrPreview] = useState<PreviewPhase[] | null>(null);
  const [trPreviewError, setTrPreviewError] = useState<string | null>(null);

  const bounds = useMemo(() => {
    try {
      return buildSeasonDateBounds(parseDateKey(dates.startDate), parseDateKey(dates.endDate));
    } catch {
      return null;
    }
  }, [dates.endDate, dates.startDate]);

  const totalWeeks = bounds?.totalWeeks ?? 1;

  const snappedLabel = bounds
    ? `${bounds.totalWeeks} weeks · ${formatDateKey(bounds.startDate)} → ${formatDateKey(bounds.endDate)}. Dates snap to whole Monday–Sunday weeks.`
    : "";

  const suggestedPreview = useMemo(
    () =>
      suggestSimplePhasesForWeeks(totalWeeks).map((phase) => ({
        name: phase.name,
        color: phase.color,
        startWeekIndex: phase.startWeekIndex,
        endWeekIndex: phase.endWeekIndex,
      })),
    [totalWeeks]
  );

  useEffect(() => {
    if (structure !== "trainerroad" || !trainerRoadCalendarSaved) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setTrPreviewError(null);
      const res = await fetch(
        `/api/settings/trainerroad?startDate=${encodeURIComponent(dates.startDate)}&endDate=${encodeURIComponent(dates.endDate)}`
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { previewPhases?: PreviewPhase[] | null; error?: string };
      if (cancelled) return;
      setTrPreview(data.previewPhases ?? []);
      if (data.previewPhases != null && data.previewPhases.length === 0) {
        setTrPreviewError("No TrainerRoad phases fall inside these dates.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dates.endDate, dates.startDate, structure, trainerRoadCalendarSaved]);

  function canAdvanceFromRaces() {
    if (structure !== "trainerroad") return true;
    return Boolean(aRace.name.trim() && aRace.date);
  }

  function handleCreate() {
    if (structure === "trainerroad") {
      if (!trainerRoadCalendarSaved) return;
      if (!aRace.name.trim() || !aRace.date) return;
      onCreate({
        name,
        startDate: dates.startDate,
        endDate: dates.endDate,
        rampDefaults: defaultSimpleRampDefaults(),
        trainerRoadDriven: true,
        goalEvent: {
          name: aRace.name.trim(),
          date: aRace.date,
          disciplines: aRace.disciplines.length > 0 ? aRace.disciplines : ["SWIM", "BIKE", "RUN"],
        },
        bGoalEvents: bRaces
          .filter((race) => race.name && race.date)
          .map(({ name: raceName, date, disciplines }) => ({ name: raceName, date, disciplines })),
        cGoalEvents: cRaces
          .filter((race) => race.name && race.date)
          .map(({ name: raceName, date, disciplines }) => ({ name: raceName, date, disciplines })),
      });
      return;
    }
    onCreate({
      name,
      startDate: dates.startDate,
      endDate: dates.endDate,
      rampDefaults: defaultSimpleRampDefaults(),
      seedPhases: structure === "suggested" ? "suggested" : "empty",
      goalEvent:
        aRace.name.trim() && aRace.date
          ? {
              name: aRace.name.trim(),
              date: aRace.date,
              disciplines: aRace.disciplines,
            }
          : undefined,
      bGoalEvents: bRaces
        .filter((race) => race.name && race.date)
        .map(({ name: raceName, date, disciplines }) => ({ name: raceName, date, disciplines })),
      cGoalEvents: cRaces
        .filter((race) => race.name && race.date)
        .map(({ name: raceName, date, disciplines }) => ({ name: raceName, date, disciplines })),
    });
  }

  const stepLabel =
    step === 1 ? "Basics" : step === 2 ? "Races" : "Structure";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New season</h1>
        <p className="text-sm text-zinc-500">
          Step {step} of 3 — {stepLabel}
        </p>
      </div>
      <ol className="flex gap-2 text-xs font-medium text-zinc-500">
        {(["Basics", "Races", "Structure"] as const).map((label, index) => {
          const n = (index + 1) as WizardStep;
          const done = step > n;
          const current = step === n;
          return (
            <li
              key={label}
              className={
                current ? "text-sky-700 dark:text-sky-300" : done ? "text-zinc-800 dark:text-zinc-200" : ""
              }
            >
              {done ? "✓ " : current ? "● " : "○ "}
              {label}
              {index < 2 ? " —" : ""}
            </li>
          );
        })}
      </ol>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Card>
        {step === 1 ? (
          <div className="space-y-4">
            <div>
              <Label>Season name</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={dates.startDate}
                  onChange={(event) => setDates({ ...dates, startDate: event.target.value })}
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  type="date"
                  value={dates.endDate}
                  onChange={(event) => setDates({ ...dates, endDate: event.target.value })}
                />
              </div>
            </div>
            <p className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              {snappedLabel}
            </p>
          </div>
        ) : null}
        {step === 2 ? (
          <RaceSection
            aRace={aRace}
            bRaces={bRaces}
            cRaces={cRaces}
            onChange={(nextA, nextB, nextC) => {
              setARace(nextA);
              setBRaces(nextB);
              setCRaces(nextC);
            }}
          />
        ) : null}
        {step === 3 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">Where do phases come from?</p>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                type="radio"
                className="mt-1"
                name="structure"
                checked={structure === "trainerroad"}
                disabled={!trainerRoadCalendarSaved}
                onChange={() => setStructure("trainerroad")}
              />
              <span className="text-sm">
                <span className="block font-medium">Follow TrainerRoad</span>
                <span className="mt-1 block text-xs text-zinc-500">
                  Imports Base/Build/Specialty blocks inside these dates. Bike stays on the
                  TrainerRoad feed; you plan swim, run, and strength.
                </span>
                {!trainerRoadCalendarSaved ? (
                  <span className="mt-1 block text-xs text-zinc-500">
                    Save a calendar URL in{" "}
                    <Link href="/settings/integrations" className="text-sky-600 hover:underline">
                      Settings → Integrations
                    </Link>{" "}
                    first.
                  </span>
                ) : null}
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                type="radio"
                className="mt-1"
                name="structure"
                checked={structure === "suggested"}
                onChange={() => setStructure("suggested")}
              />
              <span className="text-sm">
                <span className="block font-medium">Suggest phases for me</span>
                <span className="mt-1 block text-xs text-zinc-500">
                  Base / Build / Race prep / Taper, scaled to {totalWeeks} weeks.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <input
                type="radio"
                className="mt-1"
                name="structure"
                checked={structure === "empty"}
                onChange={() => setStructure("empty")}
              />
              <span className="text-sm">
                <span className="block font-medium">Start empty</span>
                <span className="mt-1 block text-xs text-zinc-500">
                  Draw phases yourself on the week grid.
                </span>
              </span>
            </label>
            {structure === "trainerroad" && (!aRace.name.trim() || !aRace.date) ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                An A race name and date are required to follow TrainerRoad. Go back to Races.
              </p>
            ) : null}
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-500">Preview</p>
              {structure === "trainerroad" ? (
                <PhasePreviewStrip
                  phases={trPreview ?? []}
                  totalWeeks={totalWeeks}
                  emptyLabel={trPreviewError ?? "TrainerRoad phases import on create."}
                />
              ) : structure === "suggested" ? (
                <PhasePreviewStrip
                  phases={suggestedPreview}
                  totalWeeks={totalWeeks}
                  emptyLabel="No phases"
                />
              ) : (
                <PhasePreviewStrip phases={[]} totalWeeks={totalWeeks} emptyLabel="Empty — add phases after create." />
              )}
            </div>
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          {step > 1 ? (
            <Button type="button" variant="secondary" onClick={() => setStep((s) => (s - 1) as WizardStep)}>
              Back
            </Button>
          ) : (
            <Link
              href="/plan/seasons"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Cancel
            </Link>
          )}
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => {
                if (step === 2 && structure === "trainerroad" && !canAdvanceFromRaces()) return;
                setStep((s) => (s + 1) as WizardStep);
              }}
              disabled={step === 1 && !name.trim()}
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              disabled={
                saving ||
                (structure === "trainerroad" &&
                  (!trainerRoadCalendarSaved || !aRace.name.trim() || !aRace.date))
              }
              onClick={handleCreate}
            >
              {saving ? "Creating…" : "Create season"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

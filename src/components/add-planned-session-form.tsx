"use client";

import { useState } from "react";
import { PlannedMetricsFields } from "@/components/planned-metrics-fields";
import {
  emptyZoneMinuteValues,
  parseZoneMinuteValues,
  ZoneMinutePills,
  type ZoneMinuteValues,
} from "@/components/zone-minute-pills";
import {
  defaultSessionTitle,
  titleMatchesSportDefault,
  type PlanDiscipline,
} from "@/lib/plan/session";
import { parseDurationMinutesInput } from "@/lib/plan/planned-metrics-triad";
import { GoalTimeInput } from "@/components/goal-time-input";
import {
  type DisciplineUnitSettings,
  poolSizeForSwimStep,
  unitSettingsForDiscipline,
  type PoolSize,
} from "@/lib/units/discipline-settings";
import { PoolSizeSelect } from "@/components/pool-size-select";
import { buildSessionTargetZones } from "@/lib/plan/session-target-zones";
import { Button, Input, Label, Select, SegmentedControl } from "@/components/ui";
import {
  DISCIPLINE_LABELS,
  DISCIPLINES,
  toggleGoalDiscipline,
  type Discipline,
} from "@/components/season/season-settings-types";

type AddPlannedSessionFormProps = {
  defaultDate: string;
  weekDays: string[];
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  onClose: () => void;
  onCreated: () => void;
  variant?: "default" | "inline";
};

const INLINE_FIELD =
  "box-border w-full min-w-0 max-w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs leading-tight text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const INLINE_LABEL = "mb-0.5 block text-[10px] font-medium leading-none text-zinc-500";

export function AddPlannedSessionForm({
  defaultDate,
  weekDays,
  disciplineSettings,
  onClose,
  onCreated,
  variant = "default",
}: AddPlannedSessionFormProps) {
  const [sessionKind, setSessionKind] = useState<"workout" | "race">("workout");
  const [raceDisciplines, setRaceDisciplines] = useState<Discipline[]>(["RUN"]);
  const [scheduledDate, setScheduledDate] = useState(defaultDate);
  const [discipline, setDiscipline] = useState<PlanDiscipline>("BIKE");
  const unitSettings = unitSettingsForDiscipline(discipline, disciplineSettings);
  const displayUnit = unitSettings.displayUnit;
  const [poolSize, setPoolSize] = useState<PoolSize>(
    () => poolSizeForSwimStep(disciplineSettings.SWIM?.poolSize)
  );
  const [title, setTitle] = useState(() => defaultSessionTitle("BIKE"));
  const [goalTimeMinutes, setGoalTimeMinutes] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState("");
  const [zoneMinutes, setZoneMinutes] = useState<ZoneMinuteValues>(emptyZoneMinuteValues);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [targetSpeedMps, setTargetSpeedMps] = useState<number | null>(null);
  const [targetPaceSeconds, setTargetPaceSeconds] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedDuration = parseDurationMinutesInput(durationMinutes);
  const durationCap = parsedDuration ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sessionTitle = title?.trim() || (sessionKind === "race" ? "Race" : defaultSessionTitle(discipline));
    if (!sessionTitle) {
      setError("Title is required");
      return;
    }

    if (sessionKind === "race" && raceDisciplines.length === 0) {
      setError("Select at least one discipline for the race");
      return;
    }

    setSaving(true);
    setError(null);

    if (sessionKind === "race") {
      const body: Record<string, unknown> = {
        scheduledDate: variant === "inline" ? defaultDate : scheduledDate,
        source: "RACE",
        title: sessionTitle,
        disciplines: raceDisciplines,
        distanceMeters,
        estimatedDurationMinutes: goalTimeMinutes,
      };
      const res = await fetch("/api/plan/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaving(false);
      if (!res.ok) {
        setError("Could not create race");
        return;
      }
      onCreated();
      return;
    }

    const zones = parseZoneMinuteValues(zoneMinutes);
    const zoneSum = Object.values(zones).reduce((s, m) => s + m, 0);
    if (parsedDuration != null && zoneSum > parsedDuration) {
      setError("Zone minutes cannot exceed duration");
      return;
    }

    setSaving(true);
    setError(null);

    const targetZones = buildSessionTargetZones(zones, parsedDuration);

    const body: Record<string, unknown> = {
      scheduledDate: variant === "inline" ? defaultDate : scheduledDate,
      discipline,
      title: title.trim() || defaultSessionTitle(discipline),
      distanceMeters,
      targetSpeedMps: discipline === "BIKE" ? targetSpeedMps : null,
      targetPaceSeconds: discipline === "BIKE" ? null : targetPaceSeconds,
      poolSize: discipline === "SWIM" ? poolSize : null,
    };

    if (Object.keys(targetZones).length > 0) {
      body.targetZones = targetZones;
    }

    const res = await fetch("/api/plan/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Could not create session");
      return;
    }

    onCreated();
  }

  const metricsFields = (
    <PlannedMetricsFields
      compact={variant === "inline"}
      discipline={discipline}
      displayUnit={displayUnit}
      poolSize={discipline === "SWIM" ? poolSize : null}
      durationMinutes={durationMinutes}
      distanceMeters={distanceMeters}
      targetSpeedMps={targetSpeedMps}
      targetPaceSeconds={targetPaceSeconds}
      onDurationMinutesChange={setDurationMinutes}
      onDistanceMetersChange={setDistanceMeters}
      onTargetSpeedMpsChange={setTargetSpeedMps}
      onTargetPaceSecondsChange={setTargetPaceSeconds}
    />
  );

  const zoneFields = (
    <ZoneMinutePills
      compact={variant === "inline"}
      values={zoneMinutes}
      maxTotalMinutes={durationCap}
      onChange={(zone, value) =>
        setZoneMinutes((prev) => ({ ...prev, [zone]: value }))
      }
    />
  );

  if (variant === "inline") {
    return (
      <div className="min-w-0 overflow-hidden rounded-md border border-dashed border-sky-400 bg-sky-50/80 p-2 text-sm shadow-sm dark:border-sky-700 dark:bg-sky-950/30">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div>
            <span className={INLINE_LABEL}>Type</span>
            <select
              className={INLINE_FIELD}
              value={sessionKind}
              onChange={(e) => setSessionKind(e.target.value as "workout" | "race")}
            >
              <option value="workout">Workout</option>
              <option value="race">Race</option>
            </select>
          </div>
          <div>
            <span className={INLINE_LABEL}>Title</span>
            <input
              type="text"
              className={INLINE_FIELD}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={sessionKind === "race" ? "Race name" : defaultSessionTitle(discipline)}
              autoFocus
            />
          </div>
          {sessionKind === "race" ? (
            <>
              <div>
                <span className={INLINE_LABEL}>Disciplines</span>
                <div className="flex flex-wrap gap-1">
                  {DISCIPLINES.map((d) => {
                    const selected = raceDisciplines.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const next = toggleGoalDiscipline(raceDisciplines, d);
                          if (next) setRaceDisciplines(next);
                        }}
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                          selected
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                        }`}
                      >
                        {DISCIPLINE_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <span className={INLINE_LABEL}>Distance (m)</span>
                <input
                  type="number"
                  min={0}
                  className={INLINE_FIELD}
                  value={distanceMeters ?? ""}
                  onChange={(e) =>
                    setDistanceMeters(e.target.value ? Number(e.target.value) : null)
                  }
                />
              </div>
              <GoalTimeInput
                compact
                value={goalTimeMinutes}
                onChange={setGoalTimeMinutes}
              />
            </>
          ) : (
            <>
              <div>
                <span className={INLINE_LABEL}>Sport</span>
                <select
                  className={INLINE_FIELD}
                  value={discipline}
                  onChange={(e) => {
                    const next = e.target.value as PlanDiscipline;
                    setTitle((prev) =>
                      titleMatchesSportDefault(prev, discipline) ? defaultSessionTitle(next) : prev
                    );
                    if (next === "BIKE") setTargetPaceSeconds(null);
                    else setTargetSpeedMps(null);
                    if (next === "SWIM") {
                      setPoolSize(poolSizeForSwimStep(disciplineSettings.SWIM?.poolSize));
                    }
                    setDiscipline(next);
                  }}
                >
                  <option value="BIKE">Bike</option>
                  <option value="RUN">Run</option>
                  <option value="SWIM">Swim</option>
                </select>
              </div>
              {discipline === "SWIM" ? (
                <PoolSizeSelect compact value={poolSize} onChange={setPoolSize} />
              ) : null}
              {metricsFields}
              <div>
                <span className={INLINE_LABEL}>Zone min</span>
                {zoneFields}
              </div>
            </>
          )}

          {error && <p className="text-[10px] text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-2">
            <Button type="submit" disabled={saving} className="px-2 py-1 text-xs">
              {saving ? "Saving…" : sessionKind === "race" ? "Add race" : "Save"}
            </Button>
            <button
              type="button"
              className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add planned session</h3>
        <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-800">
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Type</Label>
          <SegmentedControl
            value={sessionKind}
            onChange={setSessionKind}
            options={[
              { value: "workout" as const, label: "Workout" },
              { value: "race" as const, label: "Race" },
            ]}
          />
        </div>
        <div>
          <Label>Day</Label>
          <Select value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}>
            {weekDays.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={sessionKind === "race" ? "Race name" : defaultSessionTitle(discipline)}
          />
        </div>
        {sessionKind === "race" ? (
          <>
            <div className="sm:col-span-2">
              <Label>Disciplines</Label>
              <div className="flex flex-wrap gap-2">
                {DISCIPLINES.map((d) => {
                  const selected = raceDisciplines.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        const next = toggleGoalDiscipline(raceDisciplines, d);
                        if (next) setRaceDisciplines(next);
                      }}
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${
                        selected
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                      }`}
                    >
                      {DISCIPLINE_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Distance (m)</Label>
              <Input
                type="number"
                min={0}
                value={distanceMeters ?? ""}
                onChange={(e) =>
                  setDistanceMeters(e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
            <GoalTimeInput value={goalTimeMinutes} onChange={setGoalTimeMinutes} />
          </>
        ) : (
          <>
        <div>
          <Label>Sport</Label>
          <Select
            value={discipline}
            onChange={(e) => {
              const next = e.target.value as PlanDiscipline;
              setTitle((prev) =>
                titleMatchesSportDefault(prev, discipline)
                  ? defaultSessionTitle(next)
                  : prev
              );
              if (next === "BIKE") setTargetPaceSeconds(null);
              else setTargetSpeedMps(null);
              if (next === "SWIM") {
                setPoolSize(poolSizeForSwimStep(disciplineSettings.SWIM?.poolSize));
              }
              setDiscipline(next);
            }}
          >
            <option value="BIKE">Bike</option>
            <option value="RUN">Run</option>
            <option value="SWIM">Swim</option>
          </Select>
        </div>
        {metricsFields}
        {discipline === "SWIM" ? (
          <div className="sm:col-span-2">
            <PoolSizeSelect
              value={poolSize}
              onChange={setPoolSize}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Label>Zone minutes (optional)</Label>
          <div className="mt-1">{zoneFields}</div>
        </div>
          </>
        )}

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : sessionKind === "race" ? "Create race" : "Create session"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

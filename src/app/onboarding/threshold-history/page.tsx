"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { SignalType } from "@prisma/client";
import { OnboardingBack } from "@/components/onboarding-nav";
import { Button, Card, Input, Label, SegmentedControl, Select } from "@/components/ui";
import {
  parseThresholdPaceInput,
  paceInputLabel,
  thresholdPaceToInput,
} from "@/lib/units/pace";
import { signalLabel } from "@/lib/zones/display";

type ThresholdRow = {
  id: string;
  discipline: string;
  signalType: string;
  thresholdValue: number;
  effectiveDate: string;
  isEstimated: boolean;
};

type SignalPreferenceRow = {
  id: string;
  discipline: string;
  primarySignal: string;
  effectiveDate: string;
};

type DraftRow = {
  id: string;
  effectiveDate: string;
  value: string;
};

type PrimaryDraftRow = {
  id: string;
  effectiveDate: string;
  primarySignal: string;
};

type DisplayUnit = "METRIC" | "IMPERIAL";
type PrimarySignal = "POWER" | "HEART_RATE" | "PACE";

const SIGNALS: Record<string, string[]> = {
  BIKE: ["POWER", "HEART_RATE"],
  RUN: ["PACE", "HEART_RATE"],
  SWIM: ["PACE"],
};

const PRIMARY_OPTIONS: Record<string, { value: PrimarySignal; label: string }[]> = {
  BIKE: [
    { value: "POWER", label: "Power (FTP)" },
    { value: "HEART_RATE", label: "LTHR" },
  ],
  RUN: [
    { value: "PACE", label: "Pace" },
    { value: "HEART_RATE", label: "LTHR" },
  ],
};

function emptyDraftRow(): DraftRow {
  return { id: crypto.randomUUID(), effectiveDate: "", value: "" };
}

function emptyPrimaryDraftRow(discipline: string): PrimaryDraftRow {
  return {
    id: crypto.randomUUID(),
    effectiveDate: "",
    primarySignal: PRIMARY_OPTIONS[discipline]?.[0]?.value ?? "PACE",
  };
}

export default function ThresholdHistoryStep() {
  const router = useRouter();
  const [rows, setRows] = useState<ThresholdRow[]>([]);
  const [signalPreferences, setSignalPreferences] = useState<SignalPreferenceRow[]>([]);
  const [displayUnits, setDisplayUnits] = useState<Record<string, DisplayUnit>>({});
  const [discipline, setDiscipline] = useState("RUN");
  const [signalType, setSignalType] = useState("PACE");
  const [draftRows, setDraftRows] = useState<DraftRow[]>([emptyDraftRow()]);
  const [primaryDiscipline, setPrimaryDiscipline] = useState("RUN");
  const [primaryDraftRows, setPrimaryDraftRows] = useState<PrimaryDraftRow[]>([
    emptyPrimaryDraftRow("RUN"),
  ]);
  const [error, setError] = useState("");

  async function load() {
    const d = await (await fetch("/api/settings")).json();
    const units: Record<string, DisplayUnit> = {};
    for (const s of d.settings ?? []) units[s.discipline] = s.displayUnit;
    setDisplayUnits(units);
    setRows(d.thresholds ?? []);
    setSignalPreferences(d.signalPreferences ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const unit = displayUnits[discipline] ?? "METRIC";
  const isPace = signalType === "PACE";

  function formatValue(row: ThresholdRow) {
    if (row.signalType === "PACE") {
      const rowUnit = displayUnits[row.discipline] ?? "METRIC";
      return thresholdPaceToInput(
        row.thresholdValue,
        row.discipline as "RUN" | "SWIM",
        rowUnit
      );
    }
    if (row.signalType === "POWER") return `${row.thresholdValue} W`;
    return `${row.thresholdValue} bpm`;
  }

  function parseRowValue(value: string): number | null {
    if (signalType === "PACE") {
      return parseThresholdPaceInput(value, discipline as "RUN" | "SWIM", unit);
    }
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function updateDraftRow(id: string, patch: Partial<DraftRow>) {
    setDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updatePrimaryDraftRow(id: string, patch: Partial<PrimaryDraftRow>) {
    setPrimaryDraftRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function setDisplayUnit(displayUnit: DisplayUnit) {
    setDisplayUnits((prev) => ({ ...prev, [discipline]: displayUnit }));
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "discipline-units",
        data: { discipline, displayUnit },
      }),
    });
  }

  async function addEntries() {
    setError("");
    const filled = draftRows.filter((r) => r.effectiveDate || r.value);
    if (filled.length === 0) {
      setError("Add at least one row with a date and value");
      return;
    }

    for (const row of filled) {
      if (!row.effectiveDate) {
        setError("Each row needs an effective date");
        return;
      }
      const thresholdValue = parseRowValue(row.value);
      if (thresholdValue === null) {
        setError(
          isPace
            ? `Row ${format(new Date(row.effectiveDate), "MMM d, yyyy")}: use mm:ss (e.g. 5:30)`
            : `Row ${format(new Date(row.effectiveDate), "MMM d, yyyy")}: enter a positive number`
        );
        return;
      }
    }

    await Promise.all(
      filled.map((row) =>
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "threshold",
            data: {
              discipline,
              signalType,
              thresholdValue: parseRowValue(row.value),
              // Omit zoneBoundaries so the API preserves custom cutoffs from the
              // latest profile (or applies discipline/signal defaults when none exist).
              effectiveDate: row.effectiveDate,
              isEstimated: true,
            },
          }),
        })
      )
    );

    setDraftRows([emptyDraftRow()]);
    await load();
  }

  async function addPrimaryEntries() {
    setError("");
    const filled = primaryDraftRows.filter((r) => r.effectiveDate);
    if (filled.length === 0) {
      setError("Add at least one primary metric change with an effective date");
      return;
    }

    await Promise.all(
      filled.map((row) =>
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "signal-preference",
            data: {
              discipline: primaryDiscipline,
              primarySignal: row.primarySignal,
              effectiveDate: row.effectiveDate,
            },
          }),
        })
      )
    );

    setPrimaryDraftRows([emptyPrimaryDraftRow(primaryDiscipline)]);
    await load();
  }

  async function removeEntry(id: string) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "delete-threshold", id }),
    });
    await load();
  }

  async function removePrimaryEntry(id: string) {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "delete-signal-preference", id }),
    });
    await load();
  }

  async function complete() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "complete-historical-thresholds" }),
    });
    router.push("/onboarding/import");
  }

  const valuePlaceholder = isPace ? "5:30" : signalType === "POWER" ? "200" : "170";
  const valueHeader = isPace
    ? paceInputLabel(discipline as "RUN" | "SWIM", unit)
    : signalType === "POWER"
      ? "FTP (watts)"
      : "LTHR (bpm)";

  const preferenceRows = signalPreferences.filter(
    (p) => p.discipline === "BIKE" || p.discipline === "RUN"
  );

  return (
    <div className="space-y-6">
      <OnboardingBack current="HISTORICAL_THRESHOLDS" />
      <div>
        <h1 className="text-2xl font-semibold">Step 3 — Historical thresholds</h1>
        <p className="text-sm text-zinc-500">
          Add threshold and primary-metric changes with effective dates before importing
          workouts. Zone calculations use the values and primary metric in effect on each
          activity date.
        </p>
      </div>

      <Card title="Primary metric for TiZ">
        {preferenceRows.length === 0 ? (
          <p className="text-sm text-zinc-500">No primary metric history yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {preferenceRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {format(new Date(row.effectiveDate), "MMM d, yyyy")}
                  </span>
                  <span className="text-zinc-500">
                    {" "}
                    · {row.discipline} primary: {signalLabel(row.primarySignal as SignalType)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removePrimaryEntry(row.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Add primary metric change">
        <div className="space-y-4">
          <div className="min-w-[120px] max-w-xs">
            <Label>Discipline</Label>
            <Select
              value={primaryDiscipline}
              onChange={(e) => {
                const d = e.target.value;
                setPrimaryDiscipline(d);
                setPrimaryDraftRows([emptyPrimaryDraftRow(d)]);
              }}
            >
              <option value="BIKE">Bike</option>
              <option value="RUN">Run</option>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-zinc-500">
              <span>Effective from</span>
              <span>Primary metric</span>
              <span className="w-8" />
            </div>
            {primaryDraftRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  type="date"
                  value={row.effectiveDate}
                  onChange={(e) =>
                    updatePrimaryDraftRow(row.id, { effectiveDate: e.target.value })
                  }
                />
                <Select
                  value={row.primarySignal}
                  onChange={(e) =>
                    updatePrimaryDraftRow(row.id, { primarySignal: e.target.value })
                  }
                >
                  {(PRIMARY_OPTIONS[primaryDiscipline] ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() =>
                    setPrimaryDraftRows((prev) =>
                      prev.length === 1 ? prev : prev.filter((r) => r.id !== row.id)
                    )
                  }
                  disabled={primaryDraftRows.length === 1}
                  className="px-2 text-sm text-zinc-400 hover:text-red-600 disabled:opacity-30"
                  aria-label="Remove row"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setPrimaryDraftRows((prev) => [
                  ...prev,
                  emptyPrimaryDraftRow(primaryDiscipline),
                ])
              }
            >
              + Add row
            </Button>
            <Button type="button" onClick={addPrimaryEntries}>
              Save primary changes
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Threshold timeline">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No thresholds yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {format(new Date(row.effectiveDate), "MMM d, yyyy")}
                  </span>
                  <span className="text-zinc-500">
                    {" "}
                    · {row.discipline} {row.signalType.replace("_", " ").toLowerCase()} ·{" "}
                    {formatValue(row)}
                    {row.isEstimated ? " (est.)" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeEntry(row.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Add historical entries">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[120px] flex-1">
              <Label>Discipline</Label>
              <Select
                value={discipline}
                onChange={(e) => {
                  const d = e.target.value;
                  setDiscipline(d);
                  setSignalType(SIGNALS[d][0]);
                }}
              >
                <option value="BIKE">Bike</option>
                <option value="RUN">Run</option>
                <option value="SWIM">Swim</option>
              </Select>
            </div>
            <div className="min-w-[120px] flex-1">
              <Label>Signal</Label>
              <Select
                value={signalType}
                onChange={(e) => setSignalType(e.target.value)}
              >
                {SIGNALS[discipline].map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </div>
            {isPace && (discipline === "RUN" || discipline === "SWIM") && (
              <div>
                <Label>Unit</Label>
                <SegmentedControl
                  value={unit}
                  onChange={setDisplayUnit}
                  options={
                    discipline === "RUN"
                      ? [
                          { value: "METRIC", label: "min/km" },
                          { value: "IMPERIAL", label: "min/mi" },
                        ]
                      : [
                          { value: "METRIC", label: "min/100m" },
                          { value: "IMPERIAL", label: "min/100yd" },
                        ]
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-zinc-500">
              <span>Effective from</span>
              <span>{valueHeader}</span>
              <span className="w-8" />
            </div>
            {draftRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  type="date"
                  value={row.effectiveDate}
                  onChange={(e) => updateDraftRow(row.id, { effectiveDate: e.target.value })}
                />
                <Input
                  type={isPace ? "text" : "number"}
                  inputMode={isPace ? "numeric" : undefined}
                  placeholder={valuePlaceholder}
                  value={row.value}
                  onChange={(e) => updateDraftRow(row.id, { value: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() =>
                    setDraftRows((prev) =>
                      prev.length === 1 ? prev : prev.filter((r) => r.id !== row.id)
                    )
                  }
                  disabled={draftRows.length === 1}
                  className="px-2 text-sm text-zinc-400 hover:text-red-600 disabled:opacity-30"
                  aria-label="Remove row"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraftRows((prev) => [...prev, emptyDraftRow()])}
            >
              + Add row
            </Button>
            <Button type="button" onClick={addEntries}>
              Save entries
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Card>

      <Button onClick={complete}>Continue to historical import</Button>
    </div>
  );
}

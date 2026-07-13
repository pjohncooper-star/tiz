"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Discipline, SignalType } from "@prisma/client";
import { OnboardingBack } from "@/components/onboarding-nav";
import { ZoneBoundariesEditor } from "@/components/zone-boundaries-editor";
import { Button, Card, Input, Label, SegmentedControl } from "@/components/ui";
import {
  parseThresholdPaceInput,
  paceInputLabel,
  thresholdPaceToInput,
} from "@/lib/units/pace";
import { DEFAULT_ZONE_COUNT, zoneBoundariesFor } from "@/lib/zones/boundaries";

type Threshold = {
  discipline: Discipline;
  signalType: SignalType;
  thresholdValue: number;
  isEstimated: boolean;
  zoneCount: number;
  zoneBoundaries: number[];
};

type DisplayUnit = "METRIC" | "IMPERIAL";
type PrimarySignal = "POWER" | "HEART_RATE" | "PACE";

const DISCIPLINE_ORDER: Discipline[] = ["BIKE", "RUN", "SWIM"];

function primarySignalForRow(t: Threshold): PrimarySignal | null {
  if (t.discipline === "BIKE" && (t.signalType === "POWER" || t.signalType === "HEART_RATE")) {
    return t.signalType as PrimarySignal;
  }
  if (t.discipline === "RUN" && (t.signalType === "PACE" || t.signalType === "HEART_RATE")) {
    return t.signalType as PrimarySignal;
  }
  return null;
}

function PrimaryRadio({
  discipline,
  checked,
  onSelect,
}: {
  discipline: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 pb-2 text-sm text-zinc-600 dark:text-zinc-400">
      <input
        type="radio"
        name={`primary-${discipline}`}
        checked={checked}
        onChange={onSelect}
        className="h-4 w-4 border-zinc-300 text-sky-600 focus:ring-sky-500"
      />
      Primary
    </label>
  );
}

function parseBoundaries(raw: unknown, discipline: Discipline, signalType: SignalType): number[] {
  if (Array.isArray(raw) && raw.every((n) => typeof n === "number")) {
    return raw as number[];
  }
  return zoneBoundariesFor(discipline, signalType);
}

export default function ThresholdsStep() {
  const router = useRouter();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [displayUnits, setDisplayUnits] = useState<Record<string, DisplayUnit>>({});
  const [primarySignals, setPrimarySignals] = useState<Record<string, PrimarySignal>>({});
  const [paceInputs, setPaceInputs] = useState<Record<string, string>>({});
  const [paceErrors, setPaceErrors] = useState<Record<string, string>>({});
  const [expandedZones, setExpandedZones] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setOnboardingComplete(d.onboardingStep === "COMPLETE");
        const units: Record<string, DisplayUnit> = {};
        const primary: Record<string, PrimarySignal> = {};
        for (const s of d.settings ?? []) {
          units[s.discipline] = s.displayUnit;
          primary[s.discipline] = s.primarySignal;
        }

        const latest: Record<string, Threshold> = {};
        for (const t of d.thresholds ?? []) {
          const k = `${t.discipline}-${t.signalType}`;
          if (!latest[k]) {
            latest[k] = {
              discipline: t.discipline,
              signalType: t.signalType,
              thresholdValue: t.thresholdValue,
              isEstimated: t.isEstimated,
              zoneCount: t.zoneCount ?? DEFAULT_ZONE_COUNT,
              zoneBoundaries: parseBoundaries(
                t.zoneBoundaries,
                t.discipline,
                t.signalType
              ),
            };
          }
        }

        const list = Object.values(latest);
        const inputs: Record<string, string> = {};
        for (const t of list) {
          if (t.signalType !== "PACE") continue;
          const unit = units[t.discipline] ?? "METRIC";
          inputs[`${t.discipline}-${t.signalType}`] = thresholdPaceToInput(
            t.thresholdValue,
            t.discipline as "RUN" | "SWIM",
            unit
          );
        }

        setDisplayUnits(units);
        setPrimarySignals(primary);
        setPaceInputs(inputs);
        setThresholds(list);
      });
  }, []);

  async function saveThreshold(
    t: Threshold,
    value: number,
    zoneBoundaries?: number[]
  ) {
    const boundaries = zoneBoundaries ?? t.zoneBoundaries;
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "threshold",
        data: {
          discipline: t.discipline,
          signalType: t.signalType,
          thresholdValue: value,
          zoneCount: t.zoneCount,
          zoneBoundaries: boundaries,
          effectiveDate: new Date().toISOString().slice(0, 10),
          isEstimated: true,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to save threshold");
    }
    setThresholds((prev) =>
      prev.map((row) =>
        row.discipline === t.discipline && row.signalType === t.signalType
          ? { ...row, thresholdValue: value, zoneBoundaries: boundaries }
          : row
      )
    );
  }

  async function savePrimarySignal(discipline: string, primarySignal: PrimarySignal) {
    setPrimarySignals((prev) => ({ ...prev, [discipline]: primarySignal }));
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "signal-preference",
        data: {
          discipline,
          primarySignal,
          effectiveDate: new Date().toISOString().slice(0, 10),
        },
      }),
    });
  }

  async function setDisplayUnit(discipline: string, displayUnit: DisplayUnit) {
    setDisplayUnits((prev) => ({ ...prev, [discipline]: displayUnit }));
    const pace = thresholds.find((t) => t.discipline === discipline && t.signalType === "PACE");
    if (pace) {
      const key = `${pace.discipline}-${pace.signalType}`;
      setPaceInputs((prev) => ({
        ...prev,
        [key]: thresholdPaceToInput(
          pace.thresholdValue,
          pace.discipline as "RUN" | "SWIM",
          displayUnit
        ),
      }));
    }
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "discipline-units",
        data: { discipline, displayUnit },
      }),
    });
  }

  async function savePace(t: Threshold) {
    const key = `${t.discipline}-${t.signalType}`;
    const unit = displayUnits[t.discipline] ?? "METRIC";
    const parsed = parseThresholdPaceInput(
      paceInputs[key] ?? "",
      t.discipline as "RUN" | "SWIM",
      unit
    );
    if (parsed === null) {
      setPaceErrors((prev) => ({
        ...prev,
        [key]: "Use mm:ss format, e.g. 5:30",
      }));
      return;
    }
    setPaceErrors((prev) => ({ ...prev, [key]: "" }));
    await saveThreshold(t, parsed);
  }

  async function complete() {
    for (const t of thresholds) {
      if (t.signalType === "PACE") await savePace(t);
    }
    for (const discipline of ["BIKE", "RUN"] as const) {
      const primary = primarySignals[discipline];
      if (primary) {
        await savePrimarySignal(discipline, primary);
      }
    }
    if (onboardingComplete) {
      router.push("/settings");
      return;
    }
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "complete-thresholds" }),
    });
    router.push("/onboarding/threshold-history");
  }

  const label = (t: Threshold) => {
    if (t.signalType === "POWER") return `${t.discipline} FTP (watts)`;
    if (t.signalType === "HEART_RATE") return `${t.discipline} LTHR (bpm)`;
    const unit = displayUnits[t.discipline] ?? "METRIC";
    return `${t.discipline} ${paceInputLabel(t.discipline as "RUN" | "SWIM", unit)}`;
  };

  const thresholdsByDiscipline = DISCIPLINE_ORDER.map((discipline) => ({
    discipline,
    rows: thresholds.filter((t) => t.discipline === discipline),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      {onboardingComplete ? (
        <Link href="/settings" className="text-sm text-sky-600 hover:underline">
          ← Back to settings
        </Link>
      ) : (
        <OnboardingBack current="THRESHOLDS" />
      )}
      <div>
        <h1 className="text-2xl font-semibold">
          {onboardingComplete ? "Current thresholds" : "Step 2 — Current thresholds"}
        </h1>
        <p className="text-sm text-zinc-500">
          Set your best-guess thresholds for today. Choose which metric is primary for
          time-in-zone reporting on bike and run. Customize zone boundaries per sport and
          signal when needed.
        </p>
      </div>
      <Card>
        <div className="space-y-6">
          {thresholdsByDiscipline.map(({ discipline, rows }) => (
            <div key={discipline} className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {discipline}
              </h2>
              {rows.map((t) => {
                const key = `${t.discipline}-${t.signalType}`;
                const rowPrimary = primarySignalForRow(t);
                const disciplinePrimary =
                  primarySignals[t.discipline] ??
                  (t.discipline === "BIKE" ? "POWER" : t.discipline === "RUN" ? "PACE" : null);
                const isPrimary =
                  rowPrimary != null && disciplinePrimary === rowPrimary;
                const zonesOpen = expandedZones[key] ?? false;
                return (
                  <div key={key} className="space-y-1">
                    <Label>{label(t)}</Label>
                    {t.signalType === "PACE" ? (
                      <>
                        <div className="flex flex-wrap items-end gap-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="5:30"
                            className="min-w-[8rem] flex-1"
                            value={paceInputs[key] ?? ""}
                            onChange={(e) =>
                              setPaceInputs((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            onBlur={() => void savePace(t)}
                          />
                          {rowPrimary && (
                            <PrimaryRadio
                              discipline={t.discipline}
                              checked={isPrimary}
                              onSelect={() => void savePrimarySignal(t.discipline, rowPrimary)}
                            />
                          )}
                          {(t.discipline === "RUN" || t.discipline === "SWIM") && (
                            <SegmentedControl
                              value={displayUnits[t.discipline] ?? "METRIC"}
                              onChange={(unit) => void setDisplayUnit(t.discipline, unit)}
                              options={
                                t.discipline === "RUN"
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
                          )}
                        </div>
                        {paceErrors[key] && (
                          <p className="mt-1 text-sm text-red-600">{paceErrors[key]}</p>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <Input
                          type="number"
                          className="min-w-[8rem] flex-1"
                          defaultValue={t.thresholdValue}
                          onBlur={(e) => void saveThreshold(t, Number(e.target.value))}
                        />
                        {rowPrimary && (
                          <PrimaryRadio
                            discipline={t.discipline}
                            checked={isPrimary}
                            onSelect={() => void savePrimarySignal(t.discipline, rowPrimary)}
                          />
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      className="text-xs text-sky-600 hover:underline"
                      onClick={() =>
                        setExpandedZones((prev) => ({ ...prev, [key]: !zonesOpen }))
                      }
                    >
                      {zonesOpen ? "Hide zone boundaries" : "Edit zone boundaries"}
                    </button>
                    {zonesOpen && (
                      <ZoneBoundariesEditor
                        key={`${key}-${t.zoneBoundaries.join(",")}`}
                        discipline={t.discipline}
                        signalType={t.signalType}
                        thresholdValue={t.thresholdValue}
                        zoneBoundaries={t.zoneBoundaries}
                        zoneCount={t.zoneCount}
                        displayUnit={displayUnits[t.discipline] ?? "METRIC"}
                        onSave={async (boundaries) => {
                          await saveThreshold(t, t.thresholdValue, boundaries);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <Button className="mt-4" onClick={() => void complete()}>
          {onboardingComplete ? "Save and return to settings" : "Continue to historical thresholds"}
        </Button>
      </Card>
    </div>
  );
}

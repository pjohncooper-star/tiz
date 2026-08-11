"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Discipline, SignalType, ThresholdProfile } from "@prisma/client";
import { RoleSignalOverridesEditor } from "@/components/role-signal-overrides-editor";
import { ZoneBoundariesEditor } from "@/components/zone-boundaries-editor";
import {
  NumberEditorInput,
  TextEditorInput,
} from "@/components/number-editor-input";
import { Button, Input, Label, SegmentedControl } from "@/components/ui";
import {
  parseThresholdPaceInput,
  paceInputLabel,
  thresholdPaceToInput,
} from "@/lib/units/pace";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  formatZoneRangeLabel,
  zonePctRanges,
} from "@/lib/zones/display";
import { zoneBoundariesFor } from "@/lib/zones/defaults";
import { ZONE_COUNT } from "@/lib/zones/model";
import {
  normalizeRoleSignals,
  roleSignalsEqual,
} from "@/lib/zones/signal-preference";
import type {
  ThresholdDisciplineDraft,
  ThresholdProfileDraft,
  ThresholdsEditorData,
} from "@/lib/thresholds/load-editor-data.server";

type Props = {
  initialData: ThresholdsEditorData;
  /** When set, show a link to threshold history (settings surface). */
  historyHref?: string;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function cloneData(data: ThresholdsEditorData): ThresholdsEditorData {
  return structuredClone(data);
}

function profilesEqual(a: ThresholdProfileDraft, b: ThresholdProfileDraft): boolean {
  return (
    a.thresholdValue === b.thresholdValue &&
    a.zoneCount === b.zoneCount &&
    a.zoneBoundaries.length === b.zoneBoundaries.length &&
    a.zoneBoundaries.every((v, i) => v === b.zoneBoundaries[i])
  );
}

function disciplineEqual(
  a: ThresholdDisciplineDraft,
  b: ThresholdDisciplineDraft
): boolean {
  if (a.primarySignal !== b.primarySignal) return false;
  if (a.displayUnit !== b.displayUnit) return false;
  if (!roleSignalsEqual(a.roleSignals, b.roleSignals)) return false;
  if (a.profiles.length !== b.profiles.length) return false;
  return a.profiles.every((profile, i) => profilesEqual(profile, b.profiles[i]!));
}

function isDirty(draft: ThresholdsEditorData, saved: ThresholdsEditorData): boolean {
  return draft.disciplines.some(
    (d, i) => !disciplineEqual(d, saved.disciplines[i]!)
  );
}

function primaryOptions(
  discipline: Discipline
): Array<{ signal: SignalType; label: string }> {
  if (discipline === "BIKE") {
    return [
      { signal: "POWER", label: "Power" },
      { signal: "HEART_RATE", label: "Heart rate" },
    ];
  }
  if (discipline === "RUN") {
    return [
      { signal: "PACE", label: "Pace" },
      { signal: "HEART_RATE", label: "Heart rate" },
    ];
  }
  return [];
}

function thresholdLabel(
  profile: ThresholdProfileDraft,
  displayUnit: DisplayUnit
): string {
  if (profile.signalType === "POWER") return "FTP (watts)";
  if (profile.signalType === "HEART_RATE") return "LTHR (bpm)";
  return paceInputLabel(profile.discipline as "RUN" | "SWIM", displayUnit);
}

function zoneRangeRows(
  profile: ThresholdProfileDraft,
  displayUnit: DisplayUnit
): Array<{ zone: number; label: string }> {
  const ranges = zonePctRanges(
    profile.signalType,
    profile.zoneBoundaries,
    profile.zoneCount
  );
  const labelProfile = {
    signalType: profile.signalType,
    thresholdValue: profile.thresholdValue,
  } as ThresholdProfile;
  return ranges.map((range) => ({
    zone: range.zone,
    label: formatZoneRangeLabel(
      range,
      labelProfile,
      profile.discipline,
      displayUnit
    ),
  }));
}

async function putSettings(body: unknown): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to save settings");
  }
}

export function ThresholdsEditor({ initialData, historyHref }: Props) {
  const [saved, setSaved] = useState(() => cloneData(initialData));
  const [draft, setDraft] = useState(() => cloneData(initialData));
  const [customizing, setCustomizing] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => isDirty(draft, saved), [draft, saved]);

  function patchDiscipline(
    discipline: Discipline,
    patch: Partial<ThresholdDisciplineDraft>
  ) {
    setDraft((prev) => ({
      ...prev,
      disciplines: prev.disciplines.map((row) =>
        row.discipline === discipline ? { ...row, ...patch } : row
      ),
    }));
    setError(null);
  }

  function patchProfile(
    discipline: Discipline,
    signalType: SignalType,
    patch: Partial<ThresholdProfileDraft>
  ) {
    setDraft((prev) => ({
      ...prev,
      disciplines: prev.disciplines.map((row) => {
        if (row.discipline !== discipline) return row;
        return {
          ...row,
          profiles: row.profiles.map((profile) =>
            profile.signalType === signalType ? { ...profile, ...patch } : profile
          ),
        };
      }),
    }));
    setError(null);
  }

  function setPrimary(discipline: Discipline, primarySignal: SignalType) {
    setDraft((prev) => ({
      ...prev,
      disciplines: prev.disciplines.map((row) => {
        if (row.discipline !== discipline) return row;
        return {
          ...row,
          primarySignal,
          roleSignals: normalizeRoleSignals(primarySignal, row.roleSignals),
        };
      }),
    }));
    setError(null);
  }

  function applyDefaultZones(discipline: Discipline, signalType: SignalType) {
    patchProfile(discipline, signalType, {
      zoneBoundaries: zoneBoundariesFor(discipline, signalType),
      zoneCount: ZONE_COUNT,
    });
  }

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    setError(null);

    try {
      for (let i = 0; i < draft.disciplines.length; i++) {
        const next = draft.disciplines[i]!;
        const prev = saved.disciplines[i]!;

        if (next.displayUnit !== prev.displayUnit) {
          await putSettings({
            type: "discipline-units",
            data: {
              discipline: next.discipline,
              displayUnit: next.displayUnit,
            },
          });
        }

        for (let j = 0; j < next.profiles.length; j++) {
          const nextProfile = next.profiles[j]!;
          const prevProfile = prev.profiles[j]!;
          if (profilesEqual(nextProfile, prevProfile)) continue;

          const resetZones =
            nextProfile.zoneBoundaries.length === ZONE_COUNT - 1 &&
            nextProfile.zoneBoundaries.every(
              (v, idx) =>
                v === zoneBoundariesFor(next.discipline, nextProfile.signalType)[idx]
            ) &&
            !prevProfile.zoneBoundaries.every(
              (v, idx) =>
                v === zoneBoundariesFor(next.discipline, nextProfile.signalType)[idx]
            );

          await putSettings({
            type: "threshold",
            data: {
              discipline: nextProfile.discipline,
              signalType: nextProfile.signalType,
              thresholdValue: nextProfile.thresholdValue,
              zoneCount: ZONE_COUNT,
              ...(resetZones
                ? { resetZones: true }
                : { zoneBoundaries: nextProfile.zoneBoundaries }),
              effectiveDate: todayKey(),
              isEstimated: true,
            },
          });
        }

        const rolesChanged = !roleSignalsEqual(next.roleSignals, prev.roleSignals);
        const primaryChanged = next.primarySignal !== prev.primarySignal;
        if (primaryChanged || rolesChanged) {
          await putSettings({
            type: "signal-preference",
            data: {
              discipline: next.discipline,
              primarySignal: next.primarySignal,
              effectiveDate: next.roleEffectiveDate || todayKey(),
              roleSignals: normalizeRoleSignals(
                next.primarySignal,
                next.roleSignals
              ),
            },
          });
        }
      }

      setSaved(cloneData(draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Thresholds define intensity zones for each sport and metric. Structured workouts
        score TiZ from how they were built; the primary metric and role overrides apply
        when a session has no structured workout, and as stream fallback.
      </p>
      {historyHref ? (
        <p className="text-sm">
          <Link href={historyHref} className="text-sky-600 hover:underline">
            Threshold & primary metric history
          </Link>
        </p>
      ) : null}

      {draft.disciplines.map((disciplineRow) => {
        const options = primaryOptions(disciplineRow.discipline);
        return (
          <div
            key={disciplineRow.discipline}
            className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
          >
            <p className="mb-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {disciplineRow.discipline}
            </p>
            <div className="space-y-5">
              {disciplineRow.profiles.map((profile) => {
                const key = `${profile.discipline}-${profile.signalType}`;
                const isCustomizing = customizing[key] ?? false;
                const canBePrimary = options.some(
                  (opt) => opt.signal === profile.signalType
                );
                const ranges = zoneRangeRows(profile, disciplineRow.displayUnit);

                return (
                  <div key={key} className="space-y-2">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[10rem] flex-1">
                        <Label>{thresholdLabel(profile, disciplineRow.displayUnit)}</Label>
                        {profile.signalType === "PACE" ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <TextEditorInput
                              className="min-w-[8rem] flex-1"
                              placeholder="5:30"
                              inputMode="numeric"
                              allowEmpty={false}
                              value={thresholdPaceToInput(
                                profile.thresholdValue,
                                profile.discipline as "RUN" | "SWIM",
                                disciplineRow.displayUnit
                              )}
                              validate={(text) =>
                                parseThresholdPaceInput(
                                  text,
                                  profile.discipline as "RUN" | "SWIM",
                                  disciplineRow.displayUnit
                                ) != null
                              }
                              onCommit={(text) => {
                                const parsed = parseThresholdPaceInput(
                                  text,
                                  profile.discipline as "RUN" | "SWIM",
                                  disciplineRow.displayUnit
                                );
                                if (parsed == null) return;
                                patchProfile(profile.discipline, profile.signalType, {
                                  thresholdValue: parsed,
                                });
                              }}
                            />
                            {(profile.discipline === "RUN" ||
                              profile.discipline === "SWIM") && (
                              <SegmentedControl
                                value={disciplineRow.displayUnit}
                                onChange={(unit) =>
                                  patchDiscipline(profile.discipline, {
                                    displayUnit: unit,
                                  })
                                }
                                options={
                                  profile.discipline === "RUN"
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
                        ) : (
                          <NumberEditorInput
                            className="min-w-[8rem]"
                            min={1}
                            value={profile.thresholdValue}
                            onCommit={(value) => {
                              if (value == null || !(value > 0)) return;
                              patchProfile(profile.discipline, profile.signalType, {
                                thresholdValue: value,
                              });
                            }}
                          />
                        )}
                      </div>
                      {canBePrimary ? (
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 pb-2 text-sm text-zinc-600 dark:text-zinc-400">
                          <input
                            type="radio"
                            name={`primary-${disciplineRow.discipline}`}
                            checked={
                              disciplineRow.primarySignal === profile.signalType
                            }
                            onChange={() =>
                              setPrimary(profile.discipline, profile.signalType)
                            }
                            className="h-4 w-4 border-zinc-300 text-sky-600 focus:ring-sky-500"
                          />
                          Primary
                        </label>
                      ) : null}
                    </div>

                    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Intensity zones
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs">
                          <button
                            type="button"
                            className="text-sky-600 hover:underline"
                            onClick={() =>
                              applyDefaultZones(profile.discipline, profile.signalType)
                            }
                          >
                            Use defaults
                          </button>
                          <button
                            type="button"
                            className="text-sky-600 hover:underline"
                            onClick={() =>
                              setCustomizing((prev) => ({
                                ...prev,
                                [key]: !isCustomizing,
                              }))
                            }
                          >
                            {isCustomizing ? "Done customizing" : "Customize"}
                          </button>
                        </div>
                      </div>
                      {!isCustomizing ? (
                        <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {ranges.map((row) => (
                            <li key={row.zone}>
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                                Z{row.zone}
                              </span>{" "}
                              {row.label}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ZoneBoundariesEditor
                          discipline={profile.discipline}
                          signalType={profile.signalType}
                          thresholdValue={profile.thresholdValue}
                          zoneBoundaries={profile.zoneBoundaries}
                          displayUnit={disciplineRow.displayUnit}
                          onChange={(zoneBoundaries) =>
                            patchProfile(profile.discipline, profile.signalType, {
                              zoneBoundaries,
                              zoneCount: ZONE_COUNT,
                            })
                          }
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {(disciplineRow.discipline === "BIKE" ||
                disciplineRow.discipline === "RUN") && (
                <div className="space-y-2">
                  <RoleSignalOverridesEditor
                    discipline={disciplineRow.discipline}
                    primarySignal={disciplineRow.primarySignal}
                    roleSignals={disciplineRow.roleSignals}
                    onChange={(roleSignals) =>
                      patchDiscipline(disciplineRow.discipline, {
                        roleSignals: normalizeRoleSignals(
                          disciplineRow.primarySignal,
                          roleSignals
                        ),
                      })
                    }
                  />
                  <div className="max-w-xs">
                    <Label>Role metrics effective from</Label>
                    <Input
                      type="date"
                      value={disciplineRow.roleEffectiveDate}
                      onChange={(e) =>
                        patchDiscipline(disciplineRow.discipline, {
                          roleEffectiveDate: e.target.value || todayKey(),
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" onClick={() => void handleSave()} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save thresholds & zones"}
        </Button>
        {dirty && !saving && (
          <span className="text-xs text-zinc-500">Unsaved changes</span>
        )}
      </div>
    </div>
  );
}

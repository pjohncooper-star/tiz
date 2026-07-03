"use client";

import {
  DISCIPLINE_LABELS,
  focusLabel,
  PHASE_FOCUSES,
  disciplineFocusesForPhase,
  type PhaseFocus,
} from "@/components/season/season-settings-types";
import type { SeasonSettingsStepProps } from "@/components/season/steps/types";
import { Card, Input, Label, SegmentedControl, Select } from "@/components/ui";

export function GoalsTrainingDaysStep({ state }: SeasonSettingsStepProps) {
  const { phases, updatePhase, updateDisciplineFocus } = state;

  return (
    <Card title="Goals & training days">
      <p className="mb-4 text-sm text-muted-foreground">
        Weekly session budget per discipline — you&apos;ll place workouts on the calendar later.
        Unscheduled sessions show there when the week isn&apos;t full.
      </p>
      <div className="space-y-4">
        {phases.map((phase, i) => (
          <div
            key={phase.id ?? i}
            className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">{phase.name}</p>
              <p className="text-xs text-muted-foreground">{phase.phaseKind.replace("_", " ")}</p>
            </div>

            <div className="mb-4">
              <Label>Focus mode</Label>
              <SegmentedControl
                value={phase.focusMode}
                onChange={(v) => updatePhase(i, { focusMode: v })}
                options={[
                  { value: "PHASE" as const, label: "Phase focus" },
                  { value: "DISCIPLINE" as const, label: "By discipline" },
                ]}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                {phase.focusMode === "PHASE" ? (
                  <div>
                    <Label>Goal / focus</Label>
                    <Select
                      value={phase.phaseFocus ?? "AEROBIC_BASE"}
                      onChange={(e) =>
                        updatePhase(i, { phaseFocus: e.target.value as PhaseFocus })
                      }
                    >
                      {PHASE_FOCUSES.map((f) => (
                        <option key={f} value={f}>
                          {focusLabel(f)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {disciplineFocusesForPhase(phase).map((df) => (
                      <div key={df.discipline}>
                        <Label>{DISCIPLINE_LABELS[df.discipline]} focus</Label>
                        <Select
                          value={df.focus}
                          onChange={(e) =>
                            updateDisciplineFocus(i, df.discipline, e.target.value as PhaseFocus)
                          }
                        >
                          {PHASE_FOCUSES.map((f) => (
                            <option key={f} value={f}>
                              {focusLabel(f)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 lg:min-w-[14rem]">
                <div>
                  <Label>Swim d</Label>
                  <Input
                    type="number"
                    min={0}
                    max={7}
                    value={phase.swimSessionsPerWeek}
                    onChange={(e) =>
                      updatePhase(i, { swimSessionsPerWeek: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Bike d</Label>
                  <Input
                    type="number"
                    min={0}
                    max={7}
                    value={phase.bikeSessionsPerWeek}
                    onChange={(e) =>
                      updatePhase(i, { bikeSessionsPerWeek: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Run d</Label>
                  <Input
                    type="number"
                    min={0}
                    max={7}
                    value={phase.runSessionsPerWeek}
                    onChange={(e) =>
                      updatePhase(i, { runSessionsPerWeek: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

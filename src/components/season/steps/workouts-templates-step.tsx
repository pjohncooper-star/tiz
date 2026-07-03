"use client";

import Link from "next/link";
import { useState } from "react";
import { AnchorEditor } from "@/components/season/anchor-editor";
import type { SeasonSettingsStepProps } from "@/components/season/steps/types";
import { Card, Label, SegmentedControl, Select } from "@/components/ui";

export function WorkoutsTemplatesStep({ state }: SeasonSettingsStepProps) {
  const { seasonId, startDate, phases } = state;
  const [scope, setScope] = useState<"season" | "phase">("season");
  const [phaseIndex, setPhaseIndex] = useState(0);

  const selectedPhase = phases[phaseIndex];

  return (
    <div className="space-y-6">
      <Card title="Anchor workouts">
        <p className="mb-4 text-sm text-muted-foreground">
          Recurring key sessions — fixed weekday, discipline, and duration. Generic week layout
          lives on the season plan (future); your athlete weekly template is a starting preset.
        </p>

        {!seasonId && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Save season setup first to add anchor workouts.
          </p>
        )}

        {seasonId && (
          <>
            <div className="mb-4 space-y-3">
              <Label>Scope</Label>
              <SegmentedControl
                value={scope}
                onChange={setScope}
                options={[
                  { value: "season" as const, label: "Whole season" },
                  { value: "phase" as const, label: "Per phase" },
                ]}
              />
              {scope === "phase" && phases.length > 0 && (
                <div>
                  <Label>Phase</Label>
                  <Select
                    value={String(phaseIndex)}
                    onChange={(e) => setPhaseIndex(Number(e.target.value))}
                  >
                    {phases.map((p, i) => (
                      <option key={p.id ?? i} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            <AnchorEditor
              seasonPlanId={seasonId}
              seasonPhaseId={
                scope === "phase" && selectedPhase?.id ? selectedPhase.id : undefined
              }
              defaultEffectiveFrom={startDate}
            />
          </>
        )}
      </Card>

      <Card title="Weekly template">
        <p className="mb-3 text-sm text-muted-foreground">
          Your default week skeleton for off-season or as an import preset when season layout
          ships. Anchors are commitments; the template is the usual week shape.
        </p>
        <Link
          href="/calendar/template"
          className="inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          Edit weekly template on calendar
        </Link>
      </Card>
    </div>
  );
}

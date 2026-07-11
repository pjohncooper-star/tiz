"use client";

import Link from "next/link";
import { useState } from "react";
import { AnchorEditor } from "@/components/season/anchor-editor";
import { Label, SegmentedControl, Select } from "@/components/ui";
import type { SimplePhase } from "@/components/simple-planner/simple-planner-types";

type SimplePlannerAnchorSectionProps = {
  seasonPlanId: string;
  startDate: string;
  phases: SimplePhase[];
};

export function SimplePlannerAnchorSection({
  seasonPlanId,
  startDate,
  phases,
}: SimplePlannerAnchorSectionProps) {
  const [scope, setScope] = useState<"season" | "phase">("season");
  const [phaseIndex, setPhaseIndex] = useState(0);

  const selectedPhase = phases[phaseIndex];

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Recurring key sessions — fixed weekday, discipline, and duration. Anchors materialize on
        your calendar within their effective date range.
      </p>

      <div className="space-y-3">
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
              onChange={(event) => setPhaseIndex(Number(event.target.value))}
            >
              {phases.map((phase, index) => (
                <option key={phase.id ?? index} value={index}>
                  {phase.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <AnchorEditor
        seasonPlanId={seasonPlanId}
        seasonPhaseId={scope === "phase" && selectedPhase?.id ? selectedPhase.id : undefined}
        defaultEffectiveFrom={startDate}
        compact
      />

      <div className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Weekly template</p>
        <p className="mt-1 text-xs text-zinc-500">
          Your default week skeleton for off-season or as an import preset. Anchors are commitments;
          the template is the usual week shape.
        </p>
        <Link
          href="/calendar/template"
          className="mt-3 inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
        >
          Edit weekly template on calendar
        </Link>
      </div>
    </div>
  );
}

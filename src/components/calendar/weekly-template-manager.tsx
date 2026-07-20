"use client";

import { useMemo, useState } from "react";
import { WeeklyTemplateEditor } from "@/components/calendar/weekly-template-editor";
import {
  templateScopeKey,
  type TemplateScopeInput,
} from "@/lib/plan/calendar/template-scope";

export type SeasonPhaseOption = { id: string; name: string };

type WeeklyTemplateManagerProps = {
  seasonPlanId: string | null;
  seasonName: string | null;
  phases: SeasonPhaseOption[];
};

type ScopeTab = "DEFAULT" | "PHASE" | "REST" | "TEST";

const TAB_LABELS: Record<ScopeTab, string> = {
  DEFAULT: "Default",
  PHASE: "Phase",
  REST: "Rest week",
  TEST: "Test week",
};

const TAB_HINTS: Record<ScopeTab, string> = {
  DEFAULT:
    "Athlete-wide fallback used by Apply template on the calendar. Not tied to a season.",
  PHASE:
    "Weekday layout for a phase. Materializes onto that phase's normal weeks.",
  REST: "Layout for de-load / rest weeks. Volume stays engine-scaled.",
  TEST: "Layout for scheduled test weeks. These weeks sit outside the TiZ system.",
};

const DEFAULT_TEMPLATE_NAME: Record<ScopeTab, string> = {
  DEFAULT: "Weekly template",
  PHASE: "Phase template",
  REST: "Rest week template",
  TEST: "Test week template",
};

export function WeeklyTemplateManager({
  seasonPlanId,
  seasonName,
  phases,
}: WeeklyTemplateManagerProps) {
  const hasSeason = seasonPlanId != null;
  const [tab, setTab] = useState<ScopeTab>("DEFAULT");
  const [phaseId, setPhaseId] = useState<string | null>(phases[0]?.id ?? null);

  const availableTabs: ScopeTab[] = hasSeason
    ? ["DEFAULT", "PHASE", "REST", "TEST"]
    : ["DEFAULT"];

  const scope = useMemo<TemplateScopeInput | null>(() => {
    if (tab === "DEFAULT") return { kind: "DEFAULT" };
    if (!seasonPlanId) return null;
    if (tab === "PHASE") {
      return phaseId ? { kind: "PHASE", seasonPhaseId: phaseId } : null;
    }
    return { kind: tab, seasonPlanId };
  }, [tab, phaseId, seasonPlanId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {availableTabs.map((value) => {
          const active = value === tab;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-sky-500 bg-sky-50 font-medium dark:bg-sky-950/30"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              }`}
            >
              {TAB_LABELS[value]}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        {TAB_HINTS[tab]}
        {tab !== "DEFAULT" && seasonName ? (
          <span className="text-zinc-400"> · {seasonName}</span>
        ) : null}
      </p>

      {tab === "PHASE" ? (
        phases.length > 0 ? (
          <div className="max-w-xs">
            <label className="mb-1 block text-sm font-medium">Phase</label>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={phaseId ?? ""}
              onChange={(event) => setPhaseId(event.target.value || null)}
            >
              {phases.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            This season has no saved phases yet. Add phases in the planner first.
          </p>
        )
      ) : null}

      {scope ? (
        <WeeklyTemplateEditor
          key={templateScopeKey(scope)}
          scope={scope}
          showCancel={false}
          defaultName={DEFAULT_TEMPLATE_NAME[tab]}
        />
      ) : null}
    </div>
  );
}

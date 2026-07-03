"use client";

import { useSearchParams } from "next/navigation";
import { SeasonSettingsPanel } from "@/components/season/season-settings-panels";
import { useSeasonSettings } from "@/components/season/use-season-settings";
import { Button } from "@/components/ui";

type SeasonSettingsSectionProps = {
  step: number;
  title: string;
};

export function SeasonSettingsSection({ step, title }: SeasonSettingsSectionProps) {
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const state = useSeasonSettings({ seasonIdParam, mode: "edit" });

  if (state.loading) {
    return <p className="text-sm text-zinc-500">Loading season…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-zinc-500">Edit this section of your season plan.</p>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {state.success}
        </p>
      )}

      <SeasonSettingsPanel step={step} state={state} />

      <Button
        type="button"
        onClick={() => void state.saveStepWithFeedback(step)}
        disabled={
          state.saving ||
          (step === 1 && !state.cycleStructureValid) ||
          (step === 4 && !state.cycleStructureValid)
        }
      >
        {state.saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SeasonSettingsPanel } from "@/components/season/season-settings-panels";
import { SETUP_STEPS } from "@/components/season/season-settings-types";
import { useSeasonSettings } from "@/components/season/use-season-settings";
import { Button } from "@/components/ui";

export function SeasonSetupWizard() {
  const searchParams = useSearchParams();
  const seasonIdParam = searchParams.get("seasonId");
  const [step, setStep] = useState(0);
  const state = useSeasonSettings({ seasonIdParam, mode: "wizard" });

  async function handleNext() {
    const ok = await state.saveStep(step);
    if (!ok) return;
    if (step < 5) {
      setStep(step + 1);
      return;
    }
    await state.finishWizard();
  }

  if (state.loading) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Season setup</h1>
        <p className="text-sm text-zinc-500">
          Step {step + 1} of {SETUP_STEPS.length} — {SETUP_STEPS[step]}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SETUP_STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i <= step && setStep(i)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              i === step
                ? "bg-sky-600 text-white"
                : i < step
                  ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {state.error}
        </p>
      )}

      <SeasonSettingsPanel step={step} state={state} />

      <div className="flex gap-3">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Button
          type="button"
          onClick={() => void handleNext()}
          disabled={
            state.saving ||
            (step === 1 && !state.cycleStructureValid) ||
            (step === 2 && !state.cycleStructureValid)
          }
        >
          {state.saving ? "Saving…" : step === 5 ? "Finish setup" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

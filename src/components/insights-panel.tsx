"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Select } from "@/components/ui";
import {
  DEFAULT_INSIGHT_SENSITIVITY,
  INSIGHT_SENSITIVITY,
  type InsightSensitivity,
} from "@/lib/signaling/sensitivity";
import {
  DEFAULT_LOOKBACK_WINDOW_HOURS,
  LOOKBACK_WINDOW_HOURS_OPTIONS,
  LOOKBACK_WINDOW_LABELS,
  type LookbackWindowHours,
} from "@/lib/signaling/lookback-window";
import type { InsightSignalPolarity } from "@/lib/signaling/v0";

export type InsightItem = {
  id: string;
  headline: string;
  sampleSize: number;
  confidenceNote: string;
  polarity: InsightSignalPolarity;
};

const POLARITY_STYLES: Record<InsightSignalPolarity, string> = {
  risk: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  protective: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

const POLARITY_LABELS: Record<InsightSignalPolarity, string> = {
  risk: "Risk",
  protective: "Protective",
};

type InsightsPanelProps = {
  insights: InsightItem[];
  gateActivated: boolean;
};

export function InsightsPanel({ insights, gateActivated }: InsightsPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sensitivity, setSensitivity] = useState<InsightSensitivity>(
    DEFAULT_INSIGHT_SENSITIVITY
  );
  const [lookbackHours, setLookbackHours] = useState<LookbackWindowHours>(
    DEFAULT_LOOKBACK_WINDOW_HOURS
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function regenerate() {
    setLoading(true);
    setError("");
    setStatus(null);
    try {
      const res = await fetch("/api/insights/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensitivity, lookbackHours }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not regenerate insights");
        return;
      }
      setStatus(data.message ?? "Done");
      router.refresh();
    } catch {
      setError("Could not regenerate insights. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {insights.length > 0 ? (
        <ul className="space-y-3">
          {insights.map((i) => (
            <li
              key={i.id}
              className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${POLARITY_STYLES[i.polarity]}`}
                >
                  {POLARITY_LABELS[i.polarity]}
                </span>
                <p className="font-medium">{i.headline}</p>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                n={i.sampleSize} · {i.confidenceNote}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {gateActivated
            ? "No insights yet. Regenerate to scan flagged workouts for risk and protective load patterns."
            : "Insights unlock once you have enough history in Workout Signaling."}
        </p>
      )}

      {status && <p className="text-sm text-zinc-600 dark:text-zinc-400">{status}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Sensitivity</label>
          <Select
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as InsightSensitivity)}
            disabled={loading || !gateActivated}
          >
            {(Object.keys(INSIGHT_SENSITIVITY) as InsightSensitivity[]).map((key) => (
              <option key={key} value={key}>
                {INSIGHT_SENSITIVITY[key].label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-zinc-500">
            {INSIGHT_SENSITIVITY[sensitivity].description}
          </p>
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Preceding workout window</label>
          <Select
            value={lookbackHours}
            onChange={(e) => setLookbackHours(Number(e.target.value) as LookbackWindowHours)}
            disabled={loading || !gateActivated}
          >
            {LOOKBACK_WINDOW_HOURS_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>
                {LOOKBACK_WINDOW_LABELS[hours]}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-zinc-500">
            Only workouts in this window before a flagged workout count as triggers.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={regenerate}
          disabled={loading || !gateActivated}
        >
          {loading ? "Regenerating…" : "Regenerate insights"}
        </Button>
      </div>
      <Link
        href="/onboarding/day-flags"
        className="inline-block text-sm text-sky-600 hover:underline"
      >
        Review or add day flags
      </Link>
    </div>
  );
}

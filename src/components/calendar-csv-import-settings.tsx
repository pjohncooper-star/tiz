"use client";

import { useRef, useState } from "react";
import { Button, Input, Label, SegmentedControl } from "@/components/ui";
import type { CsvImportRowError } from "@/lib/plan/csv-import";

type ImportMode = "calendar" | "plan";

type ImportResponse = {
  created?: number;
  structured?: number;
  plan?: {
    id: string;
    name: string;
    sessionCount: number;
    durationDays: number;
    gapWarning?: boolean;
    maxGapDays?: number;
  };
  error?: string;
  errors?: CsvImportRowError[];
  code?: string;
};

type CalendarCsvImportSettingsProps = {
  onPlanSaved?: () => void;
};

export function CalendarCsvImportSettings({
  onPlanSaved,
}: CalendarCsvImportSettingsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("calendar");
  const [planName, setPlanName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<CsvImportRowError[]>([]);
  const [pendingLargeGapFile, setPendingLargeGapFile] = useState<File | null>(null);

  async function handleFile(file: File, confirmLargeGaps = false) {
    setUploading(true);
    setMessage(null);
    setErrors([]);
    setPendingLargeGapFile(null);

    try {
      const form = new FormData();
      form.append("file", file);

      if (mode === "plan") {
        const name = planName.trim();
        if (!name) {
          setMessage("Enter a plan name before uploading");
          setUploading(false);
          if (inputRef.current) inputRef.current.value = "";
          return;
        }
        form.append("name", name);
        if (confirmLargeGaps) form.append("confirmLargeGaps", "true");
      }

      const res = await fetch(
        mode === "plan" ? "/api/plan/training-plans" : "/api/plan/sessions/import",
        { method: "POST", body: form }
      );
      const data = (await res.json().catch(() => ({}))) as ImportResponse;

      if (!res.ok) {
        if (mode === "plan" && data.code === "LARGE_GAP") {
          setPendingLargeGapFile(file);
          setMessage(data.error ?? "Large gap between sessions");
          setErrors([]);
          return;
        }
        setMessage(data.error ?? "Import failed");
        setErrors(Array.isArray(data.errors) ? data.errors.slice(0, 20) : []);
        return;
      }

      if (mode === "plan" && data.plan) {
        const gapNote =
          data.plan.gapWarning && data.plan.maxGapDays
            ? ` Note: largest gap between sessions is ${data.plan.maxGapDays} days.`
            : "";
        setMessage(
          `Saved program “${data.plan.name}” (${data.plan.sessionCount} sessions, ${data.plan.durationDays} days).${gapNote}`
        );
        setPlanName("");
        onPlanSaved?.();
      } else {
        setMessage(
          `Imported ${data.created ?? 0} planned session(s) to your calendar` +
            (data.structured
              ? ` (${data.structured} with structured workouts).`
              : ".")
        );
      }
      setErrors([]);
    } catch {
      setMessage("Import failed");
      setErrors([]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Import sessions from CSV. Upload onto the calendar by date, or save as a reusable
        program (relative dates from the first session). Leave step columns blank for
        skeletons, or add step/repeat rows for structured workouts (nested repeats and
        absolute targets supported). Distances and paces use your Units settings.
      </p>
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { value: "calendar", label: "Upload to calendar" },
          { value: "plan", label: "Save as program" },
        ]}
      />
      {mode === "plan" ? (
        <div>
          <Label>Program name</Label>
          <Input
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            placeholder="e.g. 8-week run base"
            maxLength={120}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            window.location.assign("/api/plan/sessions/import/template");
          }}
        >
          Download template
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          disabled={uploading || (mode === "plan" && !planName.trim())}
          onClick={() => inputRef.current?.click()}
        >
          {uploading
            ? "Uploading…"
            : mode === "plan"
              ? "Save program from CSV"
              : "Upload CSV"}
        </Button>
      </div>
      {pendingLargeGapFile ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          <p>{message}</p>
          <Button
            type="button"
            disabled={uploading}
            onClick={() => void handleFile(pendingLargeGapFile, true)}
          >
            Save anyway
          </Button>
        </div>
      ) : message ? (
        <p
          className={`text-sm ${
            errors.length > 0
              ? "text-red-600 dark:text-red-400"
              : "text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {message}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-red-600 dark:text-red-400">
          {errors.map((err) => (
            <li key={`${err.row}-${err.message}`}>
              {err.row > 0 ? `Row ${err.row}: ` : ""}
              {err.message}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-zinc-500">
        Session columns: date, discipline, title, duration_min, distance, pace_or_speed,
        notes, role, pool. Step columns (optional): step, kind, intensity, duration_type,
        duration, zone, signal, repeat, step_notes, target_mode, target_low, target_high,
        target. Nested repeats use dotted step ids (e.g. 2 / 2.1 / 2.1.1, max depth 3).
        target_mode is zone (default), range, value, or relative. Relative run/swim pace:
        target like 10k, threshold, or 95%|5k — resolved from Settings → Race paces (not
        baked at import). Power/HR targets like 130% or 80% stay as % of FTP / max HR and
        resolve live (not baked). Absolute power is watts; absolute pace is mm:ss; speed is
        km/h or mph. Time step durations are minutes.
      </p>
    </div>
  );
}

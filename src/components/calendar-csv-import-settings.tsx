"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import type { CsvImportRowError } from "@/lib/plan/csv-import";

type ImportResponse = {
  created?: number;
  structured?: number;
  error?: string;
  errors?: CsvImportRowError[];
};

export function CalendarCsvImportSettings() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<CsvImportRowError[]>([]);

  async function handleFile(file: File) {
    setUploading(true);
    setMessage(null);
    setErrors([]);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/plan/sessions/import", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as ImportResponse;

      if (!res.ok) {
        setMessage(data.error ?? "Import failed");
        setErrors(Array.isArray(data.errors) ? data.errors.slice(0, 20) : []);
        return;
      }

      setMessage(
        `Imported ${data.created ?? 0} planned session(s) to your calendar` +
          (data.structured
            ? ` (${data.structured} with structured workouts).`
            : ".")
      );
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
        Import planned sessions by date onto your calendar. Leave step columns blank for
        skeleton sessions, or add step/repeat rows for a simplified structured workout.
        Distances and paces use your Units settings. Sessions are added as flexible calendar
        sessions and do not change your season plan.
      </p>
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
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload CSV"}
        </Button>
      </div>
      {message ? (
        <p
          className={`text-sm ${
            errors.length > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"
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
        duration, zone, signal, repeat, step_notes. Pace is mm:ss for run/swim; speed is km/h
        or mph for bike. Time step durations are minutes.
      </p>
    </div>
  );
}

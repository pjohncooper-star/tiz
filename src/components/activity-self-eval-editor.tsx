"use client";

import { useMemo, useState } from "react";
import type { DayQualityFlag, SurveySource } from "@prisma/client";
import { Button, Label, SegmentedControl, Select } from "@/components/ui";
import {
  DAY_QUALITY_LABELS,
  dayQualityFromFitSelfEval,
} from "@/lib/survey/fit-self-eval";
import {
  FEEL_BUCKETS,
  FEEL_LABELS,
  type SelfEvalConfig,
  type SelfEvalField,
  type SurveyFieldValue,
  valuesFromSurvey,
} from "@/lib/survey/self-eval-config";

export type ActivitySelfEvalSurvey = {
  rpe: number | null;
  freshness: number | null;
  sleep: number | null;
  motivation: number | null;
  soreness: number | null;
  note: string | null;
  customFields: unknown;
  dayQualityFlag: DayQualityFlag | null;
  source: SurveySource;
};

type ActivitySelfEvalEditorProps = {
  activityId: string;
  initialSurvey: ActivitySelfEvalSurvey | null;
  fieldConfig: SelfEvalConfig;
};

function feelBucketValue(freshness: number | null): string {
  if (freshness == null) return "";
  const bucket = FEEL_BUCKETS.find((value) => value === freshness);
  return bucket != null ? String(bucket) : "";
}

function ScaleFieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SelfEvalField;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
}) {
  const min = field.min ?? 1;
  const max = field.max ?? 10;
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === option ? null : option)}
          className={`min-w-9 rounded-md border px-2.5 py-1.5 text-sm tabular-nums ${
            value === option
              ? "border-sky-600 bg-sky-600 text-white"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function ActivitySelfEvalEditor({
  activityId,
  initialSurvey,
  fieldConfig,
}: ActivitySelfEvalEditorProps) {
  const initialValues = useMemo(() => {
    if (!initialSurvey) {
      return Object.fromEntries(fieldConfig.fields.map((field) => [field.id, null]));
    }
    return valuesFromSurvey(initialSurvey, fieldConfig);
  }, [initialSurvey, fieldConfig]);

  const [values, setValues] = useState<Record<string, SurveyFieldValue>>(initialValues);
  const [savedValues, setSavedValues] = useState(initialValues);
  const [source, setSource] = useState<SurveySource | null>(initialSurvey?.source ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const freshness =
    typeof values.freshness === "number" ? values.freshness : null;
  const rpe = typeof values.rpe === "number" ? values.rpe : null;
  const derivedDayQuality =
    freshness != null || rpe != null ? dayQualityFromFitSelfEval(freshness, rpe) : null;

  const dirty = fieldConfig.fields.some(
    (field) => values[field.id] !== savedValues[field.id]
  );

  function setFieldValue(fieldId: string, value: SurveyFieldValue) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const payload: Record<string, SurveyFieldValue> = {};
    for (const field of fieldConfig.fields) {
      payload[field.id] = values[field.id] ?? null;
    }

    const res = await fetch(`/api/activities/${activityId}/self-eval`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setSaving(false);
      setError(data?.error ?? "Could not save self evaluation");
      return;
    }

    const data = (await res.json()) as { survey: ActivitySelfEvalSurvey };
    const nextValues = valuesFromSurvey(data.survey, fieldConfig);
    setValues(nextValues);
    setSavedValues(nextValues);
    setSource(data.survey.source);
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {fieldConfig.fields.map((field) => {
        const value = values[field.id] ?? null;

        if (field.kind === "feel") {
          const feelValue = feelBucketValue(typeof value === "number" ? value : null);
          return (
            <div key={field.id}>
              <Label>{field.label}</Label>
              <SegmentedControl
                value={feelValue}
                onChange={(next) => setFieldValue(field.id, next ? Number(next) : null)}
                options={FEEL_BUCKETS.map((bucket, index) => ({
                  value: String(bucket),
                  label: FEEL_LABELS[index] ?? String(bucket),
                }))}
                className="w-full flex-wrap"
              />
            </div>
          );
        }

        if (field.kind === "rpe") {
          return (
            <div key={field.id}>
              <Label>{field.label}</Label>
              <Select
                value={typeof value === "number" ? String(value) : ""}
                onChange={(event) => {
                  const next = event.target.value;
                  setFieldValue(field.id, next ? Number(next) : null);
                }}
                disabled={saving}
              >
                <option value="">Select RPE</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((option) => (
                  <option key={option} value={option}>
                    {option}/10
                  </option>
                ))}
              </Select>
            </div>
          );
        }

        if (field.kind === "scale") {
          return (
            <div key={field.id}>
              <Label>{field.label}</Label>
              <ScaleFieldControl
                field={field}
                value={typeof value === "number" ? value : null}
                onChange={(next) => setFieldValue(field.id, next)}
                disabled={saving}
              />
            </div>
          );
        }

        return (
          <div key={field.id}>
            <Label>{field.label}</Label>
            <textarea
              value={typeof value === "string" ? value : ""}
              onChange={(event) => setFieldValue(field.id, event.target.value)}
              disabled={saving}
              rows={3}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
        );
      })}

      {derivedDayQuality ? (
        <div>
          <Label>Day quality</Label>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {DAY_QUALITY_LABELS[derivedDayQuality]}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Derived from how it felt and perceived effort
          </p>
        </div>
      ) : null}

      {source === "FIT_IMPORT" ? (
        <p className="text-xs text-zinc-500">
          Feel and effort were imported from your device; saving updates your values here.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save self evaluation"}
        </Button>
        {dirty && !saving ? (
          <span className="text-xs text-zinc-500">Unsaved changes</span>
        ) : null}
      </div>
    </div>
  );
}

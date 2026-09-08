"use client";

import { Label } from "@/components/ui";
import type { WeeklyTemplateOption } from "@/components/simple-planner/simple-planner-phases-pane";
import { templateCategoryLabel } from "@/lib/plan/calendar/template-category";

export function SeasonWeekTemplatePicker({
  templates,
  restWeekTemplateId,
  testWeekTemplateId,
  onRestChange,
  onTestChange,
}: {
  templates: WeeklyTemplateOption[];
  restWeekTemplateId: string | null;
  testWeekTemplateId: string | null;
  onRestChange: (id: string | null) => void;
  onTestChange: (id: string | null) => void;
}) {
  const selectClass =
    "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Season week templates</p>
      <p className="text-xs text-zinc-500">
        Reusable layouts for rest/de-load weeks and scheduled test weeks.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Rest week template</Label>
          <select
            className={selectClass}
            value={restWeekTemplateId ?? ""}
            onChange={(event) => onRestChange(event.target.value || null)}
          >
            <option value="">None — use phase template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({templateCategoryLabel(template.category)})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Test week template</Label>
          <select
            className={selectClass}
            value={testWeekTemplateId ?? ""}
            onChange={(event) => onTestChange(event.target.value || null)}
          >
            <option value="">None</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({templateCategoryLabel(template.category)})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

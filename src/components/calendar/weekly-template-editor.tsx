"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import { NumberEditorInput, TextEditorInput } from "@/components/number-editor-input";
import { PoolSizeSelect } from "@/components/pool-size-select";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import {
  poolSizeForSwimStep,
  swimDisplayUnit,
} from "@/lib/units/discipline-settings";
import {
  reportingDistanceInputLabel,
  reportingDistanceInputToMeters,
  reportingDistanceMetersToInput,
} from "@/lib/workout/metrics";
import {
  WEEK_DAY_HEADER_ROW_CLASS,
  WEEK_DAY_ROW_CLASS,
  weekDayColumnClass,
} from "@/components/calendar/week-day-layout";
import type { WeeklyTemplate, WeeklyTemplateItem } from "@/components/calendar/types";
import { SESSION_ROLE_LABELS, SESSION_ROLES } from "@/lib/plan/session-role";

const WEEKDAYS: WeeklyTemplateItem["weekday"][] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

const WEEKDAY_SHORT: Record<WeeklyTemplateItem["weekday"], string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

const DISCIPLINES: WeeklyTemplateItem["discipline"][] = [
  "BIKE",
  "RUN",
  "SWIM",
  "STRENGTH",
];

const COMPACT_FIELD =
  "box-border w-full min-w-0 max-w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs leading-tight text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const COMPACT_NUMBER_FIELD = `${COMPACT_FIELD} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

const FIELD_LABEL = "mb-0.5 block text-[10px] font-medium leading-none text-zinc-500";

const SESSION_CARD_CLASS =
  "min-w-0 overflow-hidden rounded-md border border-dashed border-sky-300 bg-white p-1.5 dark:border-sky-800 dark:bg-zinc-950";

type TemplateItemDraft = WeeklyTemplateItem & { key: string };

function defaultTitle(discipline: WeeklyTemplateItem["discipline"]): string {
  return DISCIPLINE_DISPLAY_LABELS[discipline];
}

function titleMatchesDisciplineDefault(
  title: string,
  discipline: WeeklyTemplateItem["discipline"]
): boolean {
  const trimmed = title.trim();
  return trimmed === "" || trimmed === defaultTitle(discipline);
}

function newDraft(weekday: WeeklyTemplateItem["weekday"]): TemplateItemDraft {
  const discipline: WeeklyTemplateItem["discipline"] = "RUN";
  return {
    key: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    weekday,
    discipline,
    title: defaultTitle(discipline),
    durationMinutes: null,
    distanceMeters: null,
    poolSize: null,
    sessionRole: "MODERATE",
    sortOrder: 0,
  };
}

function draftsFromTemplate(template: WeeklyTemplate): TemplateItemDraft[] {
  return template.items.map((item) => ({
    ...item,
    sessionRole: item.sessionRole ?? "MODERATE",
    key: item.id ?? `t_${item.weekday}_${item.sortOrder}_${Math.random().toString(36).slice(2, 5)}`,
  }));
}

type TemplateDayColumnProps = {
  weekday: WeeklyTemplateItem["weekday"];
  items: TemplateItemDraft[];
  isSelected: boolean;
  onAdd: () => void;
  onUpdate: (key: string, patch: Partial<WeeklyTemplateItem>) => void;
  onRemove: (key: string) => void;
};

function TemplateDayColumn({
  weekday,
  items,
  isSelected,
  onAdd,
  onUpdate,
  onRemove,
}: TemplateDayColumnProps) {
  return (
    <div className={weekDayColumnClass(isSelected)}>
      <div
        className={`flex h-full min-h-[10rem] flex-col rounded-md border p-2 transition ${
          isSelected
            ? "border-sky-500 bg-sky-50/40 ring-1 ring-sky-500/40 dark:border-sky-600 dark:bg-sky-950/40"
            : "border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30"
        }`}
      >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          {WEEKDAY_SHORT[weekday]}
        </span>
        <button
          type="button"
          className="text-xs text-sky-600 hover:text-sky-800 dark:text-sky-400"
          onClick={onAdd}
          aria-label={`Add session on ${WEEKDAY_SHORT[weekday]}`}
        >
          +
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">No sessions</p>
        ) : (
          items.map((row) => (
            <div key={row.key} className={SESSION_CARD_CLASS}>
              <div className="mb-1.5">
                <span className={FIELD_LABEL}>Type</span>
                <select
                  className={COMPACT_FIELD}
                  value={row.discipline}
                  onChange={(e) => {
                    const discipline = e.target.value as WeeklyTemplateItem["discipline"];
                    const patch: Partial<WeeklyTemplateItem> = {
                      discipline,
                      poolSize: discipline === "SWIM" ? "SCM" : null,
                    };
                    if (titleMatchesDisciplineDefault(row.title, row.discipline)) {
                      patch.title = defaultTitle(discipline);
                    }
                    onUpdate(row.key, patch);
                  }}
                >
                  {DISCIPLINES.map((d) => (
                    <option key={d} value={d}>
                      {DISCIPLINE_DISPLAY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-1.5">
                <span className={FIELD_LABEL}>Title</span>
                <input
                  type="text"
                  className={COMPACT_FIELD}
                  value={row.title}
                  onChange={(e) => onUpdate(row.key, { title: e.target.value })}
                />
              </div>
              <div className="mb-1.5">
                <span className={FIELD_LABEL}>Role</span>
                <select
                  className={COMPACT_FIELD}
                  value={row.sessionRole}
                  onChange={(e) =>
                    onUpdate(row.key, {
                      sessionRole: e.target.value as WeeklyTemplateItem["sessionRole"],
                    })
                  }
                >
                  {SESSION_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {SESSION_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              {row.discipline === "SWIM" ? (
                <div className="mb-1.5">
                  <PoolSizeSelect
                    compact
                    value={poolSizeForSwimStep(row.poolSize)}
                    onChange={(poolSize) => onUpdate(row.key, { poolSize })}
                  />
                </div>
              ) : null}
              <div className="mb-1.5 grid min-w-0 grid-cols-2 gap-1.5">
                <div className="min-w-0">
                  <span className={FIELD_LABEL}>Min</span>
                  <NumberEditorInput
                    min={0}
                    nullable
                    className={COMPACT_NUMBER_FIELD}
                    value={row.durationMinutes}
                    onCommit={(v) => onUpdate(row.key, { durationMinutes: v })}
                  />
                </div>
                <div className="min-w-0">
                  <span className={FIELD_LABEL}>
                    {row.discipline === "SWIM"
                      ? reportingDistanceInputLabel(
                          "SWIM",
                          swimDisplayUnit(poolSizeForSwimStep(row.poolSize))
                        )
                      : "Dist (m)"}
                  </span>
                  {row.discipline === "SWIM" ? (
                    <TextEditorInput
                      inputMode="decimal"
                      className={COMPACT_NUMBER_FIELD}
                      value={reportingDistanceMetersToInput(
                        row.distanceMeters,
                        "SWIM",
                        swimDisplayUnit(poolSizeForSwimStep(row.poolSize))
                      )}
                      onCommit={(raw) =>
                        onUpdate(row.key, {
                          distanceMeters: reportingDistanceInputToMeters(
                            raw,
                            "SWIM",
                            swimDisplayUnit(poolSizeForSwimStep(row.poolSize))
                          ),
                        })
                      }
                    />
                  ) : (
                    <NumberEditorInput
                      min={0}
                      nullable
                      integer={false}
                      inputMode="decimal"
                      className={COMPACT_NUMBER_FIELD}
                      value={row.distanceMeters}
                      onCommit={(v) => onUpdate(row.key, { distanceMeters: v })}
                    />
                  )}
                </div>
              </div>
              <button
                type="button"
                className="text-[10px] text-red-600 hover:text-red-800"
                onClick={() => onRemove(row.key)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}

export function WeeklyTemplateEditor() {
  const router = useRouter();
  const [name, setName] = useState("Weekly template");
  const [items, setItems] = useState<TemplateItemDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeekday, setSelectedWeekday] = useState<WeeklyTemplateItem["weekday"] | null>(
    null
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/plan/calendar/template");
      if (res.ok) {
        const data = await res.json();
        const template = data.template as WeeklyTemplate;
        setName(template.name);
        setItems(template.items.length > 0 ? draftsFromTemplate(template) : []);
      }
      setLoading(false);
    })();
  }, []);

  const itemsByWeekday = useMemo(() => {
    const map = new Map<WeeklyTemplateItem["weekday"], TemplateItemDraft[]>();
    for (const day of WEEKDAYS) map.set(day, []);
    for (const item of items) {
      map.get(item.weekday)?.push(item);
    }
    for (const day of WEEKDAYS) {
      map.get(day)!.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [items]);

  function updateItem(key: string, patch: Partial<WeeklyTemplateItem>) {
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addSession(weekday: WeeklyTemplateItem["weekday"]) {
    setSelectedWeekday(weekday);
    const dayItems = items.filter((i) => i.weekday === weekday);
    const draft = newDraft(weekday);
    draft.sortOrder = dayItems.length;
    setItems((rows) => [...rows, draft]);
  }

  function removeItem(key: string) {
    setItems((rows) => rows.filter((r) => r.key !== key));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const validItems = items.filter((row) => row.title.trim());
    if (validItems.length === 0) {
      setError("Add at least one session to your weekly template");
      return;
    }

    const serialized = WEEKDAYS.flatMap((weekday) => {
      const dayItems = validItems
        .filter((row) => row.weekday === weekday)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return dayItems.map((row, index) => ({
        weekday: row.weekday,
        discipline: row.discipline,
        title: row.title.trim() || defaultTitle(row.discipline),
        durationMinutes: row.durationMinutes,
        distanceMeters: row.distanceMeters,
        poolSize: row.discipline === "SWIM" ? row.poolSize : null,
        sessionRole: row.sessionRole,
        sortOrder: index,
      }));
    });

    setSaving(true);
    setError(null);
    const res = await fetch("/api/plan/calendar/template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, items: serialized }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Save failed");
      return;
    }
    router.push("/calendar");
    router.refresh();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading template…</p>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <Label>Template name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Weekly layout</p>
        <p className="mb-3 text-xs text-zinc-500">
          Add sessions to each day. New sessions default to the sport name (Bike, Run, Swim).
        </p>

        <div className={WEEK_DAY_HEADER_ROW_CLASS}>
          {WEEKDAYS.map((d) => (
            <div key={d} className={weekDayColumnClass(d === selectedWeekday)}>
              {WEEKDAY_SHORT[d]}
            </div>
          ))}
        </div>

        <div className={WEEK_DAY_ROW_CLASS}>
          {WEEKDAYS.map((weekday) => (
            <TemplateDayColumn
              key={weekday}
              weekday={weekday}
              items={itemsByWeekday.get(weekday) ?? []}
              isSelected={selectedWeekday === weekday}
              onAdd={() => addSession(weekday)}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save template"}
        </Button>
        <Link href="/calendar">
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

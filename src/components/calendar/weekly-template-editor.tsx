"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { WeeklyTemplate, WeeklyTemplateItem } from "@/components/calendar/types";
import { SESSION_ROLE_LABELS, SESSION_ROLES } from "@/lib/plan/session-role";
import type { WeeklyTemplateKind } from "@prisma/client";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
} from "@/lib/plan/calendar/template-category";
import {
  applyCatalogFormulaToItems,
  defaultZoneForRole,
  mixShareError,
} from "@/lib/plan/calendar/template-formula-shape";
import {
  parseSessionFormulaCatalog,
  type SessionFormulaCatalog,
} from "@/lib/plan/season/base-formulas";

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

const FIELD_LABEL =
  "mb-0.5 block truncate whitespace-nowrap text-[10px] font-medium leading-none text-zinc-500";

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
    sharePercent: null,
    zone: null,
    shapeKind: null,
    workSeconds: null,
    restSeconds: null,
    minReps: null,
    warmupSeconds: null,
    cooldownSeconds: null,
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
    <div className="min-w-0">
      <div
        className={`flex h-full min-h-[10rem] flex-col rounded-md border p-2.5 transition ${
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
              {row.discipline !== "STRENGTH" ? (
                <>
                  <div className="mb-1.5">
                    <span className={FIELD_LABEL}>Share %</span>
                    <NumberEditorInput
                      min={0}
                      max={100}
                      integer={false}
                      nullable
                      className={COMPACT_NUMBER_FIELD}
                      value={row.sharePercent ?? null}
                      onCommit={(v) =>
                        onUpdate(row.key, {
                          sharePercent: v,
                          ...(v != null && v > 0 && row.zone == null
                            ? { zone: defaultZoneForRole(row.sessionRole) }
                            : {}),
                        })
                      }
                    />
                  </div>
                  {row.sharePercent != null && row.sharePercent > 0 ? (
                    <>
                      <div className="mb-1.5 grid min-w-0 grid-cols-2 gap-1.5">
                        <div className="min-w-0">
                          <span className={FIELD_LABEL}>Zone</span>
                          <select
                            className={COMPACT_FIELD}
                            value={row.zone ?? defaultZoneForRole(row.sessionRole)}
                            onChange={(e) =>
                              onUpdate(row.key, { zone: Number(e.target.value) })
                            }
                          >
                            {[1, 2, 3, 4, 5].map((zone) => (
                              <option key={zone} value={zone}>
                                Z{zone}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-0">
                          <span className={FIELD_LABEL}>Shape</span>
                          <select
                            className={COMPACT_FIELD}
                            value={row.shapeKind ?? "STEADY"}
                            onChange={(e) => {
                              const shapeKind = e.target.value as "STEADY" | "FIXED";
                              onUpdate(row.key, {
                                shapeKind,
                                workSeconds:
                                  shapeKind === "FIXED" ? row.workSeconds ?? 360 : null,
                                restSeconds:
                                  shapeKind === "FIXED" ? row.restSeconds ?? 60 : null,
                                minReps: shapeKind === "FIXED" ? row.minReps ?? 1 : null,
                              });
                            }}
                          >
                            <option value="STEADY">Steady</option>
                            <option value="FIXED">Fixed</option>
                          </select>
                        </div>
                      </div>
                      {row.shapeKind === "FIXED" ? (
                        <div className="mb-1.5 grid min-w-0 grid-cols-3 gap-1.5">
                          <div className="min-w-0">
                            <span className={FIELD_LABEL}>Work min</span>
                            <NumberEditorInput
                              min={1}
                              nullable
                              className={COMPACT_NUMBER_FIELD}
                              value={
                                row.workSeconds != null
                                  ? Math.round(row.workSeconds / 60)
                                  : null
                              }
                              onCommit={(v) =>
                                onUpdate(row.key, {
                                  workSeconds: v != null ? v * 60 : null,
                                })
                              }
                            />
                          </div>
                          <div className="min-w-0">
                            <span className={FIELD_LABEL}>Rest s</span>
                            <NumberEditorInput
                              min={0}
                              nullable
                              className={COMPACT_NUMBER_FIELD}
                              value={row.restSeconds ?? null}
                              onCommit={(v) => onUpdate(row.key, { restSeconds: v })}
                            />
                          </div>
                          <div className="min-w-0">
                            <span className={FIELD_LABEL}>Min reps</span>
                            <NumberEditorInput
                              min={1}
                              nullable
                              className={COMPACT_NUMBER_FIELD}
                              value={row.minReps ?? null}
                              onCommit={(v) => onUpdate(row.key, { minReps: v })}
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="mb-1.5 grid min-w-0 grid-cols-2 gap-1.5">
                        <div className="min-w-0">
                          <span className={FIELD_LABEL}>WU min</span>
                          <NumberEditorInput
                            min={0}
                            nullable
                            className={COMPACT_NUMBER_FIELD}
                            value={
                              row.warmupSeconds != null
                                ? Math.round(row.warmupSeconds / 60)
                                : null
                            }
                            onCommit={(v) =>
                              onUpdate(row.key, {
                                warmupSeconds: v != null ? v * 60 : null,
                              })
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <span className={FIELD_LABEL}>CD min</span>
                          <NumberEditorInput
                            min={0}
                            nullable
                            className={COMPACT_NUMBER_FIELD}
                            value={
                              row.cooldownSeconds != null
                                ? Math.round(row.cooldownSeconds / 60)
                                : null
                            }
                            onCommit={(v) =>
                              onUpdate(row.key, {
                                cooldownSeconds: v != null ? v * 60 : null,
                              })
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
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

type LibraryTemplate = WeeklyTemplate & { category?: WeeklyTemplateKind };

type EditorSnapshot = {
  name: string;
  category: WeeklyTemplateKind;
  items: TemplateItemDraft[];
};

function snapshotKey(snapshot: EditorSnapshot): string {
  const items = WEEKDAYS.flatMap((weekday) =>
    snapshot.items
      .filter((row) => row.weekday === weekday)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => [
        row.weekday,
        row.discipline,
        row.title,
        row.durationMinutes,
        row.distanceMeters,
        row.poolSize,
        row.sessionRole,
        row.sharePercent ?? null,
        row.zone ?? null,
        row.shapeKind ?? null,
        row.workSeconds ?? null,
        row.restSeconds ?? null,
        row.minReps ?? null,
        row.warmupSeconds ?? null,
        row.cooldownSeconds ?? null,
      ])
  );
  return JSON.stringify({ name: snapshot.name, category: snapshot.category, items });
}

type WeeklyTemplateEditorProps = {
  /** Id of the library template to edit. */
  templateId: string;
  /** Called after a successful save with the updated name/category. */
  onSaved?: (summary: { id: string; name: string; category: WeeklyTemplateKind }) => void;
  /** Called whenever the editor gains or loses unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void;
};

export function WeeklyTemplateEditor({
  templateId,
  onSaved,
  onDirtyChange,
}: WeeklyTemplateEditorProps) {
  const router = useRouter();
  const [name, setName] = useState("Weekly template");
  const [category, setCategory] = useState<WeeklyTemplateKind>("DEFAULT");
  const [items, setItems] = useState<TemplateItemDraft[]>([]);
  const [baseline, setBaseline] = useState<EditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [selectedWeekday, setSelectedWeekday] = useState<WeeklyTemplateItem["weekday"] | null>(
    null
  );
  const [formulaCatalog, setFormulaCatalog] = useState<SessionFormulaCatalog>([]);
  const [applyFormulaId, setApplyFormulaId] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/plan/calendar/templates/${templateId}`);
      if (res.ok) {
        const data = await res.json();
        const template = data.template as LibraryTemplate;
        const loaded: EditorSnapshot = {
          name: template.name,
          category: template.category ?? "DEFAULT",
          items: template.items.length > 0 ? draftsFromTemplate(template) : [],
        };
        setName(loaded.name);
        setCategory(loaded.category);
        setItems(loaded.items);
        setBaseline(loaded);
      }
      setLoading(false);
    })();
  }, [templateId]);

  const dirty = useMemo(
    () => baseline != null && snapshotKey({ name, category, items }) !== snapshotKey(baseline),
    [baseline, name, category, items]
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function discardChanges() {
    if (!baseline) return;
    setName(baseline.name);
    setCategory(baseline.category);
    setItems(baseline.items);
    setError(null);
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = (await res.json()) as { sessionFormulaCatalog?: unknown };
      setFormulaCatalog(parseSessionFormulaCatalog(data.sessionFormulaCatalog ?? null));
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

  function applyMix() {
    const formula = formulaCatalog.find((row) => row.id === applyFormulaId);
    if (!formula) return;
    const next = applyCatalogFormulaToItems(items, formula);
    if ("error" in next) {
      setError(next.error);
      return;
    }
    setError(null);
    setItems(next);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void save();
  }

  async function save() {
    const validItems = items.filter((row) => row.title.trim());
    if (validItems.length === 0) {
      setError("Add at least one session to your weekly template");
      return;
    }
    for (const discipline of ["SWIM", "BIKE", "RUN"] as const) {
      const mixError = mixShareError(validItems, discipline);
      if (mixError) {
        setError(mixError);
        return;
      }
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
        sharePercent:
          row.sharePercent != null && row.sharePercent > 0 ? row.sharePercent : null,
        zone: row.zone ?? null,
        shapeKind: row.shapeKind ?? null,
        workSeconds: row.workSeconds ?? null,
        restSeconds: row.restSeconds ?? null,
        minReps: row.minReps ?? null,
        warmupSeconds: row.warmupSeconds ?? null,
        cooldownSeconds: row.cooldownSeconds ?? null,
      }));
    });

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/plan/calendar/templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, items: serialized }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    setSavedAt(Date.now());
    setItems(validItems);
    setBaseline({ name, category, items: validItems });
    onSaved?.({ id: templateId, name, category });
    router.refresh();
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading template…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Template name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Category</Label>
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            value={category}
            onChange={(e) => setCategory(e.target.value as WeeklyTemplateKind)}
          >
            {TEMPLATE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {TEMPLATE_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {formulaCatalog.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Label>Apply saved mix</Label>
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={applyFormulaId}
              onChange={(e) => setApplyFormulaId(e.target.value)}
            >
              <option value="">Choose a formula…</option>
              {formulaCatalog.map((formula) => (
                <option key={formula.id} value={formula.id}>
                  {formula.name} ({formula.discipline.toLowerCase()})
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={applyMix} disabled={!applyFormulaId}>
            Apply to this sport
          </Button>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium">Weekly layout</p>
        <p className="mb-3 text-xs text-zinc-500">
          Add sessions to each day. Set a share % to make that sport formulaic (shares must
          total 100%). Fixed shape is Norwegian Singles-style intervals; extra intensity
          promotes toward the longest interval.
        </p>
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-zinc-500">
          {(["SWIM", "BIKE", "RUN"] as const).map((discipline) => {
            const mixError = mixShareError(items, discipline);
            const hasMix = items.some(
              (item) => item.discipline === discipline && (item.sharePercent ?? 0) > 0
            );
            if (!hasMix && !mixError) return null;
            return (
              <span key={discipline} className={mixError ? "text-red-600" : ""}>
                {mixError ?? `${discipline.toLowerCase()} mix 100%`}
              </span>
            );
          })}
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="min-w-[68rem]">
            <div className="mb-1 grid grid-cols-7 gap-3 text-center text-xs font-medium text-zinc-500">
              {WEEKDAYS.map((d) => (
                <div key={d}>{WEEKDAY_SHORT[d]}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 items-start gap-3">
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
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {dirty || saving ? (
        <div className="sticky bottom-0 z-30 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:mx-0 md:rounded-t-lg">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-sm text-zinc-500">
              {saving ? "Saving…" : "Unsaved changes"}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={discardChanges}
            >
              Discard
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save template"}
            </Button>
          </div>
        </div>
      ) : savedAt ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">All changes saved</p>
      ) : null}
    </form>
  );
}

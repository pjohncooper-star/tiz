"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";
import {
  DurationEditorInput,
  NumberEditorInput,
  TextEditorInput,
} from "@/components/number-editor-input";
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
import { formatDurationMinSec } from "@/lib/workout/workout-tree";
import type { WeeklyTemplate, WeeklyTemplateItem } from "@/components/calendar/types";
import { SESSION_ROLE_LABELS, SESSION_ROLES } from "@/lib/plan/session-role";
import type { WeeklyTemplateKind } from "@prisma/client";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
} from "@/lib/plan/calendar/template-category";
import {
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_MIN_REPS,
  DEFAULT_REST_SECONDS,
  DEFAULT_WARMUP_SECONDS,
  applyCatalogPairing,
  defaultZoneForRole,
  fixedPackGroups,
  describeResolvedSession,
  mixShareError,
  planCatalogPairing,
  resolveTemplateFormulaWeek,
  shareTotalForDiscipline,
  sessionRoleForFormulaSession,
  type CatalogPairing,
} from "@/lib/plan/calendar/template-formula-shape";
import {
  parseSessionFormulaCatalog,
  type DisciplineFormula,
  type FormulaDiscipline,
  type FormulaSession,
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

function describeFormulaSession(session: FormulaSession): string {
  const shape = session.intensity && !session.long ? "Fixed" : "Steady";
  return `${session.sharePercent}% · Z${session.zone} ${shape}${session.long ? " · long" : ""}`;
}

/** Days to place new sessions on: empty days first, then days without this sport. */
function daysForNewSessions(
  items: WeeklyTemplateItem[],
  discipline: WeeklyTemplateItem["discipline"],
  count: number
): WeeklyTemplateItem["weekday"][] {
  const used = new Set(items.map((item) => item.weekday));
  const withSport = new Set(
    items.filter((item) => item.discipline === discipline).map((item) => item.weekday)
  );
  const ordered = [
    ...WEEKDAYS.filter((day) => !used.has(day)),
    ...WEEKDAYS.filter((day) => used.has(day) && !withSport.has(day)),
    ...WEEKDAYS.filter((day) => withSport.has(day)),
  ];
  return Array.from({ length: count }, (_, index) => ordered[index % ordered.length]!);
}

type PendingApply = {
  formula: DisciplineFormula;
  pairing: CatalogPairing;
  addMissing: boolean;
};

function ApplyMixPreview({
  pending,
  items,
  onToggleAddMissing,
  onConfirm,
  onCancel,
}: {
  pending: PendingApply;
  items: TemplateItemDraft[];
  onToggleAddMissing: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { formula, pairing } = pending;
  const sport = formula.discipline.toLowerCase();
  const addDays = daysForNewSessions(items, formula.discipline, pairing.missing.length);
  const slotLabel = (item: TemplateItemDraft) =>
    `${WEEKDAY_SHORT[item.weekday]} ${item.title || defaultTitle(item.discipline)} (${SESSION_ROLE_LABELS[item.sessionRole].toLowerCase()})`;

  return (
    <div className="rounded-md border border-sky-300 bg-sky-50/60 p-3 text-sm dark:border-sky-800 dark:bg-sky-950/30">
      <p className="mb-2 font-medium">
        Apply {formula.name} to {sport}
      </p>
      {pairing.pairs.length > 0 ? (
        <ul className="mb-2 space-y-0.5 text-xs">
          {pairing.pairs.map((pair) => (
            <li key={pair.itemIndex}>
              {slotLabel(items[pair.itemIndex]!)} → {describeFormulaSession(pair.session)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-zinc-500">No {sport} sessions on this template yet.</p>
      )}
      {pairing.missing.length > 0 ? (
        <label className="mb-2 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={pending.addMissing}
            onChange={(e) => onToggleAddMissing(e.target.checked)}
          />
          <span>
            Add {pairing.missing.length} {sport}{" "}
            {pairing.missing.length === 1 ? "session" : "sessions"}:{" "}
            {pairing.missing
              .map(
                (session, index) =>
                  `${WEEKDAY_SHORT[addDays[index]!]} ${describeFormulaSession(session)}`
              )
              .join(", ")}
            {pending.addMissing ? null : (
              <span className="block text-amber-700 dark:text-amber-400">
                Without these, {sport} shares will not total 100%.
              </span>
            )}
          </span>
        </label>
      ) : null}
      {pairing.extra.length > 0 ? (
        <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
          Not in this mix (kept duration-based, share cleared):{" "}
          {pairing.extra.map((index) => slotLabel(items[index]!)).join(", ")}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={onConfirm}>
          Apply
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const SESSION_FORMULAS_HREF = "/settings/training#session-formulas";

const MIX_SPORTS: FormulaDiscipline[] = ["SWIM", "BIKE", "RUN"];

const DEFAULT_PREVIEW_HOURS: Record<FormulaDiscipline, number | null> = {
  SWIM: 3,
  BIKE: 8,
  RUN: 5,
};

type CardPreview = {
  label: string;
  minutes: number;
  breakdown: string;
  packedWith: WeeklyTemplateItem["weekday"][];
};

function hasShare(row: WeeklyTemplateItem): boolean {
  return row.sharePercent != null && row.sharePercent > 0;
}

function defaultShapeForRole(role: WeeklyTemplateItem["sessionRole"]): "STEADY" | "FIXED" {
  return role === "INTENSITY" ? "FIXED" : "STEADY";
}

function shapePatch(
  row: WeeklyTemplateItem,
  shapeKind: "STEADY" | "FIXED"
): Partial<WeeklyTemplateItem> {
  return {
    shapeKind,
    workSeconds: shapeKind === "FIXED" ? row.workSeconds ?? 360 : null,
    restSeconds: shapeKind === "FIXED" ? row.restSeconds ?? DEFAULT_REST_SECONDS : null,
    minReps: shapeKind === "FIXED" ? row.minReps ?? DEFAULT_MIN_REPS : null,
  };
}

/**
 * Role changes carry mix defaults (Intensity → Fixed Z3, Easy → Steady Z1, …) but only
 * into fields that are empty or still on the previous role's default.
 */
function roleChangePatch(
  row: WeeklyTemplateItem,
  sessionRole: WeeklyTemplateItem["sessionRole"]
): Partial<WeeklyTemplateItem> {
  const patch: Partial<WeeklyTemplateItem> = { sessionRole };
  if (!hasShare(row) || row.discipline === "STRENGTH") return patch;
  if (row.zone == null || row.zone === defaultZoneForRole(row.sessionRole)) {
    patch.zone = defaultZoneForRole(sessionRole);
  }
  const currentShape = row.shapeKind ?? null;
  if (currentShape == null || currentShape === defaultShapeForRole(row.sessionRole)) {
    const nextShape = defaultShapeForRole(sessionRole);
    if (nextShape !== currentShape) Object.assign(patch, shapePatch(row, nextShape));
  }
  return patch;
}

const WEEKDAY_LONG: Record<WeeklyTemplateItem["weekday"], string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

const ROLE_CHIP_CLASS: Record<WeeklyTemplateItem["sessionRole"], string> = {
  EASY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  MODERATE: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  INTENSITY: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  LONG: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
};

const PANEL_LABEL = "mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400";

const PANEL_SELECT =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function swimUnit(row: WeeklyTemplateItem) {
  return swimDisplayUnit(poolSizeForSwimStep(row.poolSize));
}

function formatCardDistance(row: WeeklyTemplateItem): string | null {
  if (row.distanceMeters == null || row.distanceMeters <= 0) return null;
  if (row.discipline === "SWIM") {
    const unit = swimUnit(row);
    return `${reportingDistanceMetersToInput(row.distanceMeters, "SWIM", unit)} ${unit === "METRIC" ? "m" : "yd"}`;
  }
  if (row.distanceMeters >= 1000) {
    const km = row.distanceMeters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${Math.round(row.distanceMeters)} m`;
}

function displayTitle(row: WeeklyTemplateItem): string {
  return row.title.trim() || defaultTitle(row.discipline);
}

function SessionSummaryCard({
  row,
  preview,
  selected,
  warning,
  onSelect,
}: {
  row: TemplateItemDraft;
  preview: CardPreview | undefined;
  selected: boolean;
  warning: string | null;
  onSelect: () => void;
}) {
  const mix = hasShare(row) && row.discipline !== "STRENGTH";
  const headline = mix ? preview?.label ?? "Mix session" : displayTitle(row);
  const detail = mix
    ? `${row.sharePercent}% · ${preview ? `${preview.minutes} min` : "set preview hours"}`
    : [
        row.durationMinutes != null && row.durationMinutes > 0
          ? `${row.durationMinutes} min`
          : null,
        formatCardDistance(row),
      ]
        .filter(Boolean)
        .join(" · ") || "No duration";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative w-full min-w-0 rounded-md border bg-white p-2 text-left transition hover:border-sky-400 dark:bg-zinc-950 ${
        selected
          ? "border-sky-500 ring-2 ring-sky-500/50"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {warning ? (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500"
          title={warning}
          aria-label={warning}
        />
      ) : null}
      <span className="flex min-w-0 items-center gap-1.5 pr-3">
        <span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          {DISCIPLINE_DISPLAY_LABELS[row.discipline]}
        </span>
        <span
          className={`shrink-0 rounded px-1 py-px text-[10px] font-medium ${ROLE_CHIP_CLASS[row.sessionRole]}`}
        >
          {SESSION_ROLE_LABELS[row.sessionRole]}
        </span>
      </span>
      <span className="mt-1 block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {headline}
      </span>
      <span className="block truncate text-[11px] text-zinc-500">{detail}</span>
      {preview && preview.packedWith.length > 0 ? (
        <span className="mt-0.5 block truncate text-[11px] text-sky-700 dark:text-sky-300">
          Packed with {preview.packedWith.map((day) => WEEKDAY_SHORT[day]).join(", ")}
        </span>
      ) : null}
    </button>
  );
}

function TemplateDayColumn({
  weekday,
  items,
  previews,
  warnings,
  selectedKey,
  onAdd,
  onSelect,
}: {
  weekday: WeeklyTemplateItem["weekday"];
  items: TemplateItemDraft[];
  previews: Map<string, CardPreview>;
  warnings: Map<string, string>;
  selectedKey: string | null;
  onAdd: () => void;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex min-h-[8rem] min-w-0 flex-col rounded-md border border-zinc-200 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          {WEEKDAY_SHORT[weekday]}
        </span>
        <button
          type="button"
          className="rounded px-1 text-sm leading-none text-sky-600 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-400 dark:hover:bg-sky-950"
          onClick={onAdd}
          aria-label={`Add session on ${WEEKDAY_LONG[weekday]}`}
        >
          +
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {items.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-1 items-center justify-center rounded-md border border-dashed border-zinc-300 py-4 text-xs text-zinc-400 hover:border-sky-400 hover:text-sky-600 dark:border-zinc-700"
          >
            Rest day · + Add
          </button>
        ) : (
          items.map((row) => (
            <SessionSummaryCard
              key={row.key}
              row={row}
              preview={previews.get(row.key)}
              selected={row.key === selectedKey}
              warning={warnings.get(row.key) ?? null}
              onSelect={() => onSelect(row.key)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionEditorPanel({
  row,
  preview,
  previewHours,
  onUpdate,
  onDuplicate,
  onRemove,
  onClose,
}: {
  row: TemplateItemDraft;
  preview: CardPreview | undefined;
  previewHours: number | null;
  onUpdate: (patch: Partial<WeeklyTemplateItem>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const sport = DISCIPLINE_DISPLAY_LABELS[row.discipline];
  const canMix = row.discipline !== "STRENGTH";
  const mix = canMix && hasShare(row);
  const fixed = mix && row.shapeKind === "FIXED";
  const customTitle = titleMatchesDisciplineDefault(row.title, row.discipline) ? "" : row.title;

  return (
    <section
      className="rounded-lg border border-sky-300 bg-white p-4 dark:border-sky-800 dark:bg-zinc-950"
      aria-label={`${WEEKDAY_LONG[row.weekday]} ${sport} session`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">
          {WEEKDAY_LONG[row.weekday]} · {sport} session
        </h3>
        <Button type="button" variant="secondary" onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="text-red-600 dark:text-red-400"
          onClick={onRemove}
        >
          Remove
        </Button>
        <button
          type="button"
          className="rounded px-2 py-1 text-lg leading-none text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={onClose}
          aria-label="Close session editor"
        >
          ×
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className={PANEL_LABEL}>Sport</span>
          <select
            className={PANEL_SELECT}
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
              onUpdate(patch);
            }}
          >
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>
                {DISCIPLINE_DISPLAY_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={PANEL_LABEL}>Role</span>
          <select
            className={PANEL_SELECT}
            value={row.sessionRole}
            onChange={(e) =>
              onUpdate(roleChangePatch(row, e.target.value as WeeklyTemplateItem["sessionRole"]))
            }
          >
            {SESSION_ROLES.map((role) => (
              <option key={role} value={role}>
                {SESSION_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={PANEL_LABEL}>Title (optional)</span>
          <Input
            value={customTitle}
            placeholder={mix && preview ? `${preview.label} (auto)` : sport}
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>
        {canMix ? (
          <div>
            <span className={PANEL_LABEL}>Share of weekly {sport.toLowerCase()} %</span>
            <NumberEditorInput
              min={0}
              max={100}
              integer={false}
              nullable
              placeholder="Duration-based"
              value={row.sharePercent ?? null}
              onCommit={(v) =>
                onUpdate({
                  sharePercent: v,
                  ...(v != null && v > 0 && row.zone == null
                    ? { zone: defaultZoneForRole(row.sessionRole) }
                    : {}),
                })
              }
            />
          </div>
        ) : null}
      </div>

      {mix ? (
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Mix</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <span className={PANEL_LABEL}>Zone</span>
              <select
                className={PANEL_SELECT}
                value={row.zone ?? defaultZoneForRole(row.sessionRole)}
                onChange={(e) => onUpdate({ zone: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((zone) => (
                  <option key={zone} value={zone}>
                    Z{zone}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <span className={PANEL_LABEL}>Shape</span>
              <div
                role="radiogroup"
                aria-label="Workout shape"
                className="grid grid-cols-2 overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700"
              >
                {(["STEADY", "FIXED"] as const).map((shape) => {
                  const active = (row.shapeKind ?? "STEADY") === shape;
                  return (
                    <button
                      key={shape}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        if (!active) onUpdate(shapePatch(row, shape));
                      }}
                      className={`px-3 py-2 text-sm font-medium ${
                        active
                          ? "bg-sky-600 text-white"
                          : "bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300"
                      }`}
                    >
                      {shape === "STEADY" ? "Steady" : "Fixed intervals"}
                    </button>
                  );
                })}
              </div>
            </div>
            {fixed ? (
              <>
                <div>
                  <span className={PANEL_LABEL}>Work</span>
                  <DurationEditorInput
                    compact
                    ariaLabel="Work interval (min:sec)"
                    seconds={row.workSeconds}
                    onCommit={(v) => onUpdate({ workSeconds: v })}
                  />
                </div>
                <div>
                  <span className={PANEL_LABEL}>Rest</span>
                  <DurationEditorInput
                    compact
                    allowZero
                    ariaLabel="Rest between reps (min:sec)"
                    seconds={row.restSeconds}
                    onCommit={(v) => onUpdate({ restSeconds: v })}
                  />
                </div>
                <div>
                  <span className={PANEL_LABEL}>Min reps</span>
                  <NumberEditorInput
                    min={1}
                    nullable
                    value={row.minReps ?? null}
                    onCommit={(v) => onUpdate({ minReps: v })}
                  />
                </div>
              </>
            ) : null}
            <div>
              <span className={PANEL_LABEL}>Warm-up</span>
              <DurationEditorInput
                compact
                allowZero
                optional
                ariaLabel="Warm-up (min:sec)"
                placeholder={formatDurationMinSec(DEFAULT_WARMUP_SECONDS)}
                seconds={row.warmupSeconds}
                onCommit={(v) => onUpdate({ warmupSeconds: v })}
              />
            </div>
            <div>
              <span className={PANEL_LABEL}>Cool-down</span>
              <DurationEditorInput
                compact
                allowZero
                optional
                ariaLabel="Cool-down (min:sec)"
                placeholder={formatDurationMinSec(DEFAULT_COOLDOWN_SECONDS)}
                seconds={row.cooldownSeconds}
                onCommit={(v) => onUpdate({ cooldownSeconds: v })}
              />
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            {preview ? (
              <>
                <span className="font-medium">
                  {preview.minutes} min at {previewHours} h/wk:
                </span>{" "}
                {preview.breakdown}
              </>
            ) : (
              "Set preview hours for this sport to see the generated session."
            )}
          </p>
          {preview && preview.packedWith.length > 0 ? (
            <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
              Packed with {preview.packedWith.map((day) => WEEKDAY_LONG[day]).join(", ")} (same
              sport and zone, fixed intervals share one rep budget)
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 border-t border-zinc-200 pt-4 sm:grid-cols-3 lg:grid-cols-4 dark:border-zinc-800">
          <div>
            <span className={PANEL_LABEL}>Duration (min)</span>
            <NumberEditorInput
              min={0}
              nullable
              value={row.durationMinutes}
              onCommit={(v) => onUpdate({ durationMinutes: v })}
            />
          </div>
          {row.discipline !== "STRENGTH" ? (
            <div>
              <span className={PANEL_LABEL}>
                {row.discipline === "SWIM"
                  ? reportingDistanceInputLabel("SWIM", swimUnit(row))
                  : "Distance (m)"}
              </span>
              {row.discipline === "SWIM" ? (
                <TextEditorInput
                  inputMode="decimal"
                  value={reportingDistanceMetersToInput(row.distanceMeters, "SWIM", swimUnit(row))}
                  onCommit={(raw) =>
                    onUpdate({
                      distanceMeters: reportingDistanceInputToMeters(raw, "SWIM", swimUnit(row)),
                    })
                  }
                />
              ) : (
                <NumberEditorInput
                  min={0}
                  nullable
                  integer={false}
                  inputMode="decimal"
                  value={row.distanceMeters}
                  onCommit={(v) => onUpdate({ distanceMeters: v })}
                />
              )}
            </div>
          ) : null}
        </div>
      )}

      {row.discipline === "SWIM" ? (
        <div className="mt-3 max-w-xs">
          <PoolSizeSelect
            className={PANEL_SELECT}
            labelClassName={PANEL_LABEL}
            value={poolSizeForSwimStep(row.poolSize)}
            onChange={(poolSize) => onUpdate({ poolSize })}
          />
        </div>
      ) : null}
    </section>
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
        displayTitle(row),
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [formulaCatalog, setFormulaCatalog] = useState<SessionFormulaCatalog>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [applyFormulaIds, setApplyFormulaIds] = useState<
    Partial<Record<FormulaDiscipline, string>>
  >({});
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);
  const [undo, setUndo] = useState<{ items: TemplateItemDraft[]; label: string } | null>(
    null
  );

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 15000);
    return () => window.clearTimeout(timer);
  }, [undo]);

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
    setPendingApply(null);
    setUndo(null);
    setSelectedKey((key) => (baseline.items.some((row) => row.key === key) ? key : null));
  }

  useEffect(() => {
    if (!selectedKey) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      setSelectedKey(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedKey]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = (await res.json()) as { sessionFormulaCatalog?: unknown };
      setFormulaCatalog(parseSessionFormulaCatalog(data.sessionFormulaCatalog ?? null));
      setCatalogLoaded(true);
    })();
  }, []);

  const [previewHours, setPreviewHours] =
    useState<Record<FormulaDiscipline, number | null>>(DEFAULT_PREVIEW_HOURS);

  const mixSports = MIX_SPORTS.filter((discipline) =>
    items.some((item) => item.discipline === discipline && hasShare(item))
  );

  const cardPreviews = useMemo(() => {
    const hours: Partial<Record<FormulaDiscipline, number>> = {};
    for (const discipline of MIX_SPORTS) {
      const value = previewHours[discipline];
      if (value != null && value > 0) hours[discipline] = value;
    }
    const resolved = resolveTemplateFormulaWeek(items, hours);
    const groups = fixedPackGroups(items);
    const map = new Map<string, CardPreview>();
    items.forEach((item, index) => {
      const session = resolved[index];
      if (!session) return;
      const group = groups.find((members) => members.includes(index)) ?? [];
      const packedWith = group
        .filter((member) => member !== index)
        .map((member) => items[member]!.weekday)
        .sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
      map.set(item.key, {
        label: session.label,
        minutes: session.durationMinutes,
        breakdown: describeResolvedSession(session),
        packedWith,
      });
    });
    return map;
  }, [items, previewHours]);

  const cardWarnings = useMemo(() => {
    const offTotal = new Set(
      MIX_SPORTS.filter((discipline) => mixShareError(items, discipline) != null)
    );
    const map = new Map<string, string>();
    for (const item of items) {
      if (hasShare(item) && item.discipline !== "STRENGTH") {
        if (offTotal.has(item.discipline as FormulaDiscipline)) {
          map.set(item.key, `${DISCIPLINE_DISPLAY_LABELS[item.discipline]} shares don't total 100%`);
        }
      } else if (
        (item.durationMinutes == null || item.durationMinutes <= 0) &&
        (item.distanceMeters == null || item.distanceMeters <= 0)
      ) {
        map.set(item.key, "No share, duration, or distance set");
      }
    }
    return map;
  }, [items]);

  const selectedRow = items.find((row) => row.key === selectedKey) ?? null;

  const toolbarSports = MIX_SPORTS.filter(
    (discipline) =>
      items.some((item) => item.discipline === discipline) ||
      formulaCatalog.some((formula) => formula.discipline === discipline)
  );

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

  function previewApply(discipline: FormulaDiscipline) {
    const formula = formulaCatalog.find(
      (row) => row.id === applyFormulaIds[discipline] && row.discipline === discipline
    );
    if (!formula) return;
    const pairing = planCatalogPairing(items, formula);
    setPendingApply({ formula, pairing, addMissing: pairing.missing.length > 0 });
    setSelectedKey(null);
  }

  function confirmApply() {
    if (!pendingApply) return;
    const { formula, addMissing } = pendingApply;
    let pairing = pendingApply.pairing;
    let base = items;
    if (addMissing && pairing.missing.length > 0) {
      const days = daysForNewSessions(items, formula.discipline, pairing.missing.length);
      const dayCounts = new Map<WeeklyTemplateItem["weekday"], number>();
      const added = pairing.missing.map((session, index) => {
        const weekday = days[index]!;
        const taken =
          dayCounts.get(weekday) ?? items.filter((item) => item.weekday === weekday).length;
        dayCounts.set(weekday, taken + 1);
        const draft = newDraft(weekday);
        draft.key = `${draft.key}_${index}`;
        draft.discipline = formula.discipline;
        draft.title = defaultTitle(formula.discipline);
        draft.poolSize = formula.discipline === "SWIM" ? "SCM" : null;
        draft.sessionRole = sessionRoleForFormulaSession(session);
        draft.sortOrder = taken;
        return draft;
      });
      base = [...items, ...added];
      pairing = {
        ...pairing,
        pairs: [
          ...pairing.pairs,
          ...pairing.missing.map((session, index) => ({
            itemIndex: items.length + index,
            session,
          })),
        ],
        missing: [],
      };
    }
    setUndo({ items, label: `Applied ${formula.name} to ${formula.discipline.toLowerCase()}` });
    setItems(applyCatalogPairing(base, pairing));
    setPendingApply(null);
    setApplyFormulaIds((current) => ({ ...current, [formula.discipline]: "" }));
    setError(null);
  }

  function undoApply() {
    if (!undo) return;
    setItems(undo.items);
    setUndo(null);
  }

  function nextSortOrder(weekday: WeeklyTemplateItem["weekday"]): number {
    const orders = items.filter((row) => row.weekday === weekday).map((row) => row.sortOrder);
    return orders.length > 0 ? Math.max(...orders) + 1 : 0;
  }

  function addSession(weekday: WeeklyTemplateItem["weekday"]) {
    const draft = newDraft(weekday);
    draft.sortOrder = nextSortOrder(weekday);
    setItems((rows) => [...rows, draft]);
    setPendingApply(null);
    setSelectedKey(draft.key);
  }

  function duplicateItem(key: string) {
    const source = items.find((row) => row.key === key);
    if (!source) return;
    const copy: TemplateItemDraft = {
      ...source,
      id: undefined,
      key: newDraft(source.weekday).key,
      sortOrder: nextSortOrder(source.weekday),
    };
    setItems((rows) => [...rows, copy]);
    setSelectedKey(copy.key);
  }

  function removeItem(key: string) {
    const removed = items.find((row) => row.key === key);
    if (removed && key === selectedKey) {
      const day = itemsByWeekday.get(removed.weekday) ?? [];
      const index = day.findIndex((row) => row.key === key);
      setSelectedKey(day[index + 1]?.key ?? day[index - 1]?.key ?? null);
    }
    setItems((rows) => rows.filter((r) => r.key !== key));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void save();
  }

  async function save() {
    const validItems = items;
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

      <div>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-sm font-medium">Weekly layout</p>
          <p className="text-xs text-zinc-500">
            Click a session to edit it. A share % builds that session from its sport&apos;s
            weekly hours.
          </p>
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer text-sky-600 hover:underline dark:text-sky-400">
              How mixes work
            </summary>
            <p className="mt-1 max-w-2xl">
              A sport&apos;s shares must total 100%; sessions without a share keep their own
              duration. Steady is warm-up, one block, cool-down. Fixed intervals that share a
              sport and zone are packed together, and extra time promotes reps toward the
              longest interval (Norwegian Singles style). Preview hours only change this page;
              each phase&apos;s weekly hours set the real durations.
            </p>
          </details>
        </div>

        {toolbarSports.length > 0 || catalogLoaded ? (
          <div className="mb-3 divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {toolbarSports.map((discipline) => {
              const sportFormulas = formulaCatalog.filter(
                (formula) => formula.discipline === discipline
              );
              const hasMix = mixSports.includes(discipline);
              const total = Math.round(shareTotalForDiscipline(items, discipline) * 10) / 10;
              const gap = Math.round((100 - total) * 10) / 10;
              const tone =
                Math.abs(gap) <= 0.5
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : gap > 0
                    ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
              const detail =
                Math.abs(gap) <= 0.5 ? "" : gap > 0 ? ` · ${gap}% left` : ` · ${-gap}% over`;
              return (
                <div key={discipline} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="w-12 text-sm font-medium">
                    {DISCIPLINE_DISPLAY_LABELS[discipline]}
                  </span>
                  {hasMix ? (
                    <>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
                        {total}%{detail}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        Preview
                        <span className="w-16">
                          <NumberEditorInput
                            min={0}
                            integer={false}
                            nullable
                            ariaLabel={`${DISCIPLINE_DISPLAY_LABELS[discipline]} preview hours per week`}
                            value={previewHours[discipline]}
                            onCommit={(value) =>
                              setPreviewHours((current) => ({ ...current, [discipline]: value }))
                            }
                          />
                        </span>
                        h/wk
                      </label>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-500">Duration-based</span>
                  )}
                  {sportFormulas.length > 0 ? (
                    <div className="ml-auto flex items-center gap-2">
                      <select
                        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        aria-label={`Saved ${discipline.toLowerCase()} mix`}
                        value={applyFormulaIds[discipline] ?? ""}
                        onChange={(e) => {
                          setApplyFormulaIds((current) => ({
                            ...current,
                            [discipline]: e.target.value,
                          }));
                          setPendingApply(null);
                        }}
                      >
                        <option value="">Saved mix…</option>
                        {sportFormulas.map((formula) => (
                          <option key={formula.id} value={formula.id}>
                            {formula.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => previewApply(discipline)}
                        disabled={
                          !applyFormulaIds[discipline] ||
                          pendingApply?.formula.discipline === discipline
                        }
                      >
                        Apply mix…
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {catalogLoaded && formulaCatalog.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-500">
                No saved mixes yet.{" "}
                <Link href={SESSION_FORMULAS_HREF} className="text-sky-600 hover:underline">
                  Create one in Settings
                </Link>{" "}
                to stamp a sport&apos;s shares and zones in one step.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[56rem] grid-cols-7 items-stretch gap-2">
            {WEEKDAYS.map((weekday) => (
              <TemplateDayColumn
                key={weekday}
                weekday={weekday}
                items={itemsByWeekday.get(weekday) ?? []}
                previews={cardPreviews}
                warnings={cardWarnings}
                selectedKey={selectedKey}
                onAdd={() => addSession(weekday)}
                onSelect={(key) => {
                  setPendingApply(null);
                  setSelectedKey((current) => (current === key ? null : key));
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {undo ? (
            <div className="flex items-center gap-3 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">
              <span className="mr-auto">{undo.label}</span>
              <button type="button" className="font-semibold underline" onClick={undoApply}>
                Undo
              </button>
            </div>
          ) : null}
          {pendingApply ? (
            <ApplyMixPreview
              pending={pendingApply}
              items={items}
              onToggleAddMissing={(addMissing) =>
                setPendingApply((current) => (current ? { ...current, addMissing } : current))
              }
              onConfirm={confirmApply}
              onCancel={() => setPendingApply(null)}
            />
          ) : selectedRow ? (
            <SessionEditorPanel
              key={selectedRow.key}
              row={selectedRow}
              preview={cardPreviews.get(selectedRow.key)}
              previewHours={
                selectedRow.discipline === "STRENGTH"
                  ? null
                  : previewHours[selectedRow.discipline as FormulaDiscipline]
              }
              onUpdate={(patch) => updateItem(selectedRow.key, patch)}
              onDuplicate={() => duplicateItem(selectedRow.key)}
              onRemove={() => removeItem(selectedRow.key)}
              onClose={() => setSelectedKey(null)}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
              Select a session to edit it, or press + on a day to add one.
            </p>
          )}
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

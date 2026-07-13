"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Discipline, SignalType } from "@prisma/client";
import { Button, Input, Label, Select } from "@/components/ui";
import { SwimIntervalSetEditor } from "@/components/swim-interval-set-editor";
import { WorkoutProfileChart } from "@/components/workout-profile-chart";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisplayUnit } from "@/lib/workout/metrics";
import {
  stepPaceCanonicalToInput,
  stepPaceInputLabel,
  stepPaceInputToCanonical,
} from "@/lib/workout/metrics";
import {
  poolSizeForSwimStep,
  type PoolSize,
} from "@/lib/units/discipline-settings";
import {
  defaultLeafStep,
  defaultRampStep,
  defaultRepeatBlock,
  defaultSwimIntervalSet,
  formatDurationSeconds,
  formatDurationHms,
  intensityLabel,
  parseDurationInput,
  primarySignalForDiscipline,
  totalTreeDurationSeconds,
  type LeafStep,
  type RampStep,
  type RepeatBlock,
  type SwimIntervalSet,
  type StepDuration,
  type StepIntensity,
  type StepTarget,
  type WorkoutNode,
  type WorkoutTreeDocument,
} from "@/lib/workout/workout-tree";
import { formatSwimIntervalLabel } from "@/lib/workout/swim-interval-set";
import {
  moveWorkoutNode,
  getNodeAtPath,
  nodeDragId,
  parseNodeDragId,
  parseSlotDragId,
  pathKey,
  pathsEqual,
  slotDragId,
} from "@/lib/workout/workout-tree-move";
import {
  signalTypeToTargetSignal,
  signalTypeToTargetView,
} from "@/lib/zones/signal-preference";

type WorkoutTreeEditorProps = {
  discipline: Discipline;
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
  tree: WorkoutTreeDocument;
  onChange: (tree: WorkoutTreeDocument) => void;
  thresholdPaceSeconds?: number | null;
  primarySignal?: SignalType | null;
  /** Compact chart + scrollable chart/steps viewport (calendar Build panel). */
  compact?: boolean;
};

type TargetView = "zone" | "pace_power" | "heart_rate";
type LengthView = "duration" | "distance";

function resolvePrimaryTargetSignal(
  discipline: Discipline,
  primarySignal?: SignalType | null
) {
  if (primarySignal) return signalTypeToTargetSignal(primarySignal);
  return primarySignalForDiscipline(discipline);
}

const STEP_TYPES: StepIntensity[] = [
  "warmup",
  "active",
  "interval",
  "recovery",
  "rest",
  "cooldown",
];

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-700 dark:bg-zinc-900">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              value === opt.value
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 dark:text-zinc-400"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function collectLeaves(nodes: WorkoutNode[]): LeafStep[] {
  const out: LeafStep[] = [];
  for (const node of nodes) {
    if (node.kind === "step") out.push(node);
    else if (node.kind === "repeat") out.push(...collectLeaves(node.children));
  }
  return out;
}

function isZoneRangeTarget(t: StepTarget): boolean {
  if (t.mode !== "range" || t.low == null || t.high == null) return false;
  return (
    Number.isInteger(t.low) &&
    Number.isInteger(t.high) &&
    t.low >= 1 &&
    t.low <= 7 &&
    t.high >= 1 &&
    t.high <= 7
  );
}

function inferTargetView(
  nodes: WorkoutNode[],
  discipline: Discipline,
  primarySignal?: SignalType | null
): TargetView {
  const leaves = collectLeaves(nodes);
  if (!leaves.length && primarySignal) {
    return signalTypeToTargetView(primarySignal);
  }
  const first = leaves[0];
  if (!first) return "zone";
  const t = first.target;

  if (t.mode === "zone" && t.zone != null) {
    if (t.signal === "heart_rate") return "heart_rate";
    return "zone";
  }
  if (t.mode === "range") {
    if (t.signal === "heart_rate") return "heart_rate";
    if (isZoneRangeTarget(t)) return "zone";
    return "pace_power";
  }
  if (t.signal === "heart_rate") return "heart_rate";
  if (t.signal === "open") return "zone";
  if (t.signal === "pace" || t.signal === "speed") return "pace_power";
  if (t.signal === "power" && t.mode === "value") return "pace_power";
  if (first.targetPaceSeconds) return "pace_power";
  if (discipline === "STRENGTH") return "zone";
  return "zone";
}

function inferLengthView(nodes: WorkoutNode[]): LengthView {
  const leaves = collectLeaves(nodes);
  if (leaves.some((l) => l.duration.type === "distance")) return "distance";
  return "duration";
}

function updateAtPath(
  nodes: WorkoutNode[],
  path: number[],
  updater: (node: WorkoutNode) => WorkoutNode
): WorkoutNode[] {
  const [head, ...rest] = path;
  return nodes.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) return updater(node);
    if (node.kind !== "repeat") return node;
    return { ...node, children: updateAtPath(node.children, rest, updater) };
  });
}

function removeAtPath(nodes: WorkoutNode[], path: number[]): WorkoutNode[] {
  const [head, ...rest] = path;
  if (rest.length === 0) return nodes.filter((_, i) => i !== head);
  return nodes.map((node, i) => {
    if (i !== head || node.kind !== "repeat") return node;
    return { ...node, children: removeAtPath(node.children, rest) };
  });
}

function mapLeaves(
  nodes: WorkoutNode[],
  fn: (step: LeafStep) => LeafStep
): WorkoutNode[] {
  return nodes.map((node) => {
    if (node.kind === "step") return fn(node);
    if (node.kind === "repeat") {
      return { ...node, children: mapLeaves(node.children, fn) };
    }
    return node;
  });
}

function applyTargetView(
  step: LeafStep,
  view: TargetView,
  discipline: Discipline,
  primaryTargetSignal = primarySignalForDiscipline(discipline)
): LeafStep {
  const zone = step.target.zone ?? 2;
  const withoutPace = { ...step };
  delete withoutPace.targetPaceSeconds;

  if (view === "zone") {
    return {
      ...withoutPace,
      target: {
        signal: primaryTargetSignal,
        mode: "zone",
        zone,
      },
    };
  }
  if (view === "heart_rate") {
    return {
      ...withoutPace,
      target: {
        signal: "heart_rate",
        mode: "zone",
        zone: Math.min(zone, 5),
      },
    };
  }
  if (discipline === "BIKE") {
    return {
      ...withoutPace,
      target: {
        signal: "power",
        mode: "value",
        value: step.target.value ?? (step.target.zone ? step.target.zone * 30 + 140 : 200),
      },
    };
  }
  if (discipline === "RUN" || discipline === "SWIM") {
    return {
      ...withoutPace,
      target: { signal: "pace", mode: "value" },
      targetPaceSeconds: step.targetPaceSeconds ?? 300,
    };
  }
  return step;
}

function applyLengthView(step: LeafStep, view: LengthView): LeafStep {
  if (view === "distance") {
    if (step.duration.type === "distance") return step;
    return {
      ...step,
      duration: {
        type: "distance",
        value: step.distanceMeters ?? 1000,
      },
    };
  }
  if (step.duration.type === "time" || step.duration.type === "open") return step;
  return {
    ...step,
    duration: { type: "time", value: 600 },
  };
}

function supportsLapEnd(discipline: Discipline): boolean {
  return discipline === "RUN" || discipline === "BIKE";
}

function nodeDragSummary(
  node: WorkoutNode,
  poolSize: PoolSize | null,
  displayUnit: DisplayUnit
): string {
  if (node.kind === "step") return intensityLabel(node.intensity);
  if (node.kind === "ramp") return "Ramp";
  if (node.kind === "swim_interval") return formatSwimIntervalLabel(node, poolSize, displayUnit);
  return `Repeat × ${node.repeatCount}`;
}

function DraggableNodeShell({
  path,
  dimmed,
  children,
}: {
  path: number[];
  dimmed: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: nodeDragId(path),
    data: { path },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-1 ${dimmed || isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        className="mt-3 flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        aria-label="Drag to reorder"
        {...listeners}
        {...attributes}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <circle cx="4" cy="3" r="1.25" />
          <circle cx="10" cy="3" r="1.25" />
          <circle cx="4" cy="7" r="1.25" />
          <circle cx="10" cy="7" r="1.25" />
          <circle cx="4" cy="11" r="1.25" />
          <circle cx="10" cy="11" r="1.25" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function WorkoutDropSlot({
  parentPath,
  index,
  active,
}: {
  parentPath: number[];
  index: number;
  active: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: slotDragId(parentPath, index),
    data: { parentPath, index },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded transition-all ${
        isOver
          ? "my-1 h-2 bg-sky-500"
          : active
            ? "h-1.5 bg-transparent"
            : "h-0.5 bg-transparent"
      }`}
    />
  );
}

function DurationEditorInput({
  seconds,
  onCommit,
  label,
  placeholder = "0:10:00",
  optional = false,
}: {
  seconds: number | null | undefined;
  onCommit: (seconds: number | null) => void;
  label: string;
  placeholder?: string;
  optional?: boolean;
}) {
  const resolved = seconds != null && seconds > 0 ? seconds : null;
  const [text, setText] = useState(() => (resolved != null ? formatDurationHms(resolved) : ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(resolved != null ? formatDurationHms(resolved) : "");
    }
  }, [resolved, focused]);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed) {
      if (optional) {
        onCommit(null);
        setText("");
      } else if (resolved != null) {
        setText(formatDurationHms(resolved));
      }
      return;
    }
    const sec = parseDurationInput(trimmed);
    if (sec != null && sec > 0) {
      onCommit(sec);
      setText(formatDurationHms(sec));
      return;
    }
    if (resolved != null) {
      setText(formatDurationHms(resolved));
    } else {
      setText("");
    }
  }

  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <Input
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function StepDurationInput({
  duration,
  lengthView,
  discipline,
  displayUnit,
  poolSize,
  onChange,
}: {
  duration: StepDuration;
  lengthView: LengthView;
  discipline: Discipline;
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
  onChange: (duration: StepDuration) => void;
}) {
  if (lengthView === "distance") {
    const planDiscipline = discipline as PlanDiscipline;
    const swimPool = planDiscipline === "SWIM" ? poolSizeForSwimStep(poolSize) : null;
    const distanceLabel =
      planDiscipline === "SWIM"
        ? swimPool === "SCY"
          ? "Distance (yd)"
          : "Distance (m)"
        : displayUnit === "METRIC"
          ? "Distance (m)"
          : "Distance (mi)";

    const meters = duration.type === "distance" ? duration.value : 1000;
    const displayValue =
      planDiscipline === "SWIM" && swimPool === "SCY"
        ? Math.round(meters * 1.09361)
        : displayUnit === "IMPERIAL" && planDiscipline !== "SWIM"
          ? Math.round((meters / 1609.344) * 100) / 100
          : meters;

    return (
      <div className="min-w-0">
        <Label>{distanceLabel}</Label>
        <Input
          type="number"
          min={1}
          step={planDiscipline === "SWIM" ? (swimPool === "SCY" ? 25 : 50) : 0.1}
          value={displayValue}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v) || v <= 0) return;
            let metersValue = v;
            if (planDiscipline === "SWIM" && swimPool === "SCY") {
              metersValue = v / 1.09361;
            } else if (displayUnit === "IMPERIAL" && planDiscipline !== "SWIM") {
              metersValue = v * 1609.344;
            }
            onChange({ type: "distance", value: metersValue });
          }}
        />
      </div>
    );
  }

  const lapEnd = duration.type === "open";
  if (lapEnd) {
    return (
      <DurationEditorInput
        label="Est. duration"
        optional
        placeholder="Optional"
        seconds={duration.type === "open" ? duration.estimateSeconds : undefined}
        onCommit={(sec) =>
          onChange({
            type: "open",
            ...(sec ? { estimateSeconds: sec } : {}),
          })
        }
      />
    );
  }

  return (
    <DurationEditorInput
      label="Duration"
      seconds={duration.type === "time" ? duration.value : 600}
      onCommit={(sec) => {
        if (sec) onChange({ type: "time", value: sec });
      }}
    />
  );
}

function RangeToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="shrink-0">
      <Label>Range</Label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Target as a range"
        onClick={() => onChange(!checked)}
        className={`relative mt-1 block h-7 w-12 rounded-full transition-colors ${
          checked ? "bg-sky-600" : "bg-zinc-300 dark:bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function enableRangeTarget(
  step: LeafStep,
  targetView: TargetView,
  discipline: Discipline,
  primaryTargetSignal = primarySignalForDiscipline(discipline)
): Partial<LeafStep> {
  const t = step.target;
  if (targetView === "zone") {
    const z = t.zone ?? 2;
    return {
      target: {
        signal: primaryTargetSignal,
        mode: "range",
        low: Math.max(1, z - 1),
        high: Math.min(7, z + 1),
      },
    };
  }
  if (targetView === "heart_rate") {
    const z = t.zone ?? 2;
    return {
      target: {
        signal: "heart_rate",
        mode: "range",
        low: Math.max(1, z - 1),
        high: Math.min(5, z + 1),
      },
    };
  }
  if (discipline === "BIKE") {
    const v = t.value ?? 200;
    return {
      target: {
        signal: "power",
        mode: "range",
        low: Math.round(v * 0.85),
        high: Math.round(v * 1.1),
      },
    };
  }
  const pace = step.targetPaceSeconds ?? 300;
  return {
    target: {
      signal: "pace",
      mode: "range",
      low: Math.round(pace * 0.92),
      high: Math.round(pace * 1.08),
    },
  };
}

function disableRangeTarget(
  step: LeafStep,
  targetView: TargetView,
  discipline: Discipline,
  primaryTargetSignal = primarySignalForDiscipline(discipline)
): Partial<LeafStep> {
  const t = step.target;
  if (t.mode !== "range") return {};
  if (targetView === "zone" || targetView === "heart_rate") {
    const mid =
      t.low != null && t.high != null ? Math.round((t.low + t.high) / 2) : (t.zone ?? 2);
    return {
      target: {
        signal:
          targetView === "heart_rate" ? "heart_rate" : primaryTargetSignal,
        mode: "zone",
        zone: mid,
      },
    };
  }
  if (discipline === "BIKE") {
    const mid =
      t.low != null && t.high != null ? Math.round((t.low + t.high) / 2) : (t.value ?? 200);
    return { target: { signal: "power", mode: "value", value: mid } };
  }
  const mid =
    t.low != null && t.high != null
      ? Math.round((t.low + t.high) / 2)
      : (step.targetPaceSeconds ?? 300);
  return { target: { signal: "pace", mode: "value" }, targetPaceSeconds: mid };
}

function LapEndToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="shrink-0">
      <Label>Lap end</Label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="End step on lap button"
        onClick={() => onChange(!checked)}
        className={`relative mt-1 block h-7 w-12 rounded-full transition-colors ${
          checked
            ? "bg-sky-600"
            : "bg-zinc-300 dark:bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function targetFieldLabel(
  targetView: TargetView,
  discipline: Discipline,
  displayUnit: DisplayUnit,
  poolSize: PoolSize | null
): string {
  if (targetView === "zone") return "Zone";
  if (targetView === "heart_rate") return "HR zone";
  if (discipline === "BIKE") return "Power (W)";
  if (discipline === "RUN" || discipline === "SWIM") {
    return stepPaceInputLabel(discipline as PlanDiscipline, displayUnit, poolSize);
  }
  return "Target";
}

function StepTargetField({
  step,
  targetView,
  discipline,
  displayUnit,
  poolSize,
  primaryTargetSignal,
  onChange,
}: {
  step: LeafStep;
  targetView: TargetView;
  discipline: Discipline;
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
  primaryTargetSignal: ReturnType<typeof primarySignalForDiscipline>;
  onChange: (patch: Partial<LeafStep>) => void;
}) {
  const planDiscipline = discipline as PlanDiscipline;
  const label = targetFieldLabel(targetView, discipline, displayUnit, poolSize);
  const rangeMode = step.target.mode === "range";

  if (targetView === "zone") {
    if (rangeMode) {
      const low = step.target.low ?? 2;
      const high = step.target.high ?? 4;
      return (
        <div className="min-w-0">
          <Label>{label} range</Label>
          <div className="grid grid-cols-2 gap-1">
            <Select
              value={String(low)}
              onChange={(e) =>
                onChange({
                  target: {
                    signal: primaryTargetSignal,
                    mode: "range",
                    low: Number(e.target.value),
                    high,
                  },
                })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7].map((z) => (
                <option key={z} value={z}>
                  Z{z}
                </option>
              ))}
            </Select>
            <Select
              value={String(high)}
              onChange={(e) =>
                onChange({
                  target: {
                    signal: primaryTargetSignal,
                    mode: "range",
                    low,
                    high: Number(e.target.value),
                  },
                })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7].map((z) => (
                <option key={z} value={z}>
                  Z{z}
                </option>
              ))}
            </Select>
          </div>
        </div>
      );
    }
    return (
      <div className="min-w-0">
        <Label>{label}</Label>
        <Select
          value={String(step.target.zone ?? 2)}
          onChange={(e) =>
            onChange({
              target: {
                signal: primaryTargetSignal,
                mode: "zone",
                zone: Number(e.target.value),
              },
            })
          }
        >
          {[1, 2, 3, 4, 5, 6, 7].map((z) => (
            <option key={z} value={z}>
              Zone {z}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (targetView === "heart_rate") {
    if (rangeMode) {
      const low = step.target.low ?? 2;
      const high = step.target.high ?? 4;
      return (
        <div className="min-w-0">
          <Label>{label} range</Label>
          <div className="grid grid-cols-2 gap-1">
            <Select
              value={String(low)}
              onChange={(e) =>
                onChange({
                  target: {
                    signal: "heart_rate",
                    mode: "range",
                    low: Number(e.target.value),
                    high,
                  },
                })
              }
            >
              {[1, 2, 3, 4, 5].map((z) => (
                <option key={z} value={z}>
                  Z{z}
                </option>
              ))}
            </Select>
            <Select
              value={String(high)}
              onChange={(e) =>
                onChange({
                  target: {
                    signal: "heart_rate",
                    mode: "range",
                    low,
                    high: Number(e.target.value),
                  },
                })
              }
            >
              {[1, 2, 3, 4, 5].map((z) => (
                <option key={z} value={z}>
                  Z{z}
                </option>
              ))}
            </Select>
          </div>
        </div>
      );
    }
    return (
      <div className="min-w-0">
        <Label>{label}</Label>
        <Select
          value={String(step.target.zone ?? 2)}
          onChange={(e) =>
            onChange({
              target: {
                signal: "heart_rate",
                mode: "zone",
                zone: Number(e.target.value),
              },
            })
          }
        >
          {[1, 2, 3, 4, 5].map((z) => (
            <option key={z} value={z}>
              HR zone {z}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  if (discipline === "BIKE") {
    if (rangeMode) {
      const low = step.target.low ?? 170;
      const high = step.target.high ?? 230;
      return (
        <div className="min-w-0">
          <Label>{label} range</Label>
          <div className="grid grid-cols-2 gap-1">
            <Input
              type="number"
              min={1}
              step={5}
              value={low}
              aria-label="Low power watts"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) {
                  onChange({
                    target: { signal: "power", mode: "range", low: v, high },
                  });
                }
              }}
            />
            <Input
              type="number"
              min={1}
              step={5}
              value={high}
              aria-label="High power watts"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) {
                  onChange({
                    target: { signal: "power", mode: "range", low, high: v },
                  });
                }
              }}
            />
          </div>
        </div>
      );
    }
    const watts = step.target.value ?? 200;
    return (
      <div className="min-w-0">
        <Label>{label}</Label>
        <Input
          type="number"
          min={1}
          step={5}
          value={watts}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > 0) {
              onChange({
                target: { signal: "power", mode: "value", value: v },
              });
            }
          }}
        />
      </div>
    );
  }

  if (discipline === "RUN" || discipline === "SWIM") {
    if (rangeMode) {
      const low = step.target.low ?? 280;
      const high = step.target.high ?? 320;
      return (
        <div className="min-w-0">
          <Label>{label} range</Label>
          <div className="grid grid-cols-2 gap-1">
            <Input
              value={stepPaceCanonicalToInput(low, planDiscipline, displayUnit, poolSize)}
              aria-label="Fast pace"
              onChange={(e) => {
                const pace = stepPaceInputToCanonical(
                  e.target.value,
                  planDiscipline,
                  displayUnit,
                  poolSize
                );
                if (pace) {
                  onChange({
                    target: { signal: "pace", mode: "range", low: pace, high },
                  });
                }
              }}
              placeholder="Fast"
            />
            <Input
              value={stepPaceCanonicalToInput(high, planDiscipline, displayUnit, poolSize)}
              aria-label="Slow pace"
              onChange={(e) => {
                const pace = stepPaceInputToCanonical(
                  e.target.value,
                  planDiscipline,
                  displayUnit,
                  poolSize
                );
                if (pace) {
                  onChange({
                    target: { signal: "pace", mode: "range", low, high: pace },
                  });
                }
              }}
              placeholder="Slow"
            />
          </div>
        </div>
      );
    }
    return (
      <div className="min-w-0">
        <Label>{label}</Label>
        <Input
          value={stepPaceCanonicalToInput(
            step.targetPaceSeconds,
            planDiscipline,
            displayUnit,
            poolSize
          )}
          onChange={(e) => {
            const pace = stepPaceInputToCanonical(
              e.target.value,
              planDiscipline,
              displayUnit,
              poolSize
            );
            onChange({
              target: { signal: "pace", mode: "value" },
              ...(pace ? { targetPaceSeconds: pace } : {}),
            });
          }}
          placeholder="5:00"
        />
      </div>
    );
  }

  return null;
}

function NodeEditor({
  node,
  discipline,
  displayUnit,
  poolSize,
  targetView,
  lengthView,
  primaryTargetSignal,
  path,
  siblingCount,
  activeDragPath,
  onTreeChange,
}: {
  node: WorkoutNode;
  discipline: Discipline;
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
  targetView: TargetView;
  lengthView: LengthView;
  primaryTargetSignal: ReturnType<typeof primarySignalForDiscipline>;
  path: number[];
  siblingCount: number;
  activeDragPath: number[] | null;
  onTreeChange: (updater: (nodes: WorkoutNode[]) => WorkoutNode[]) => void;
}) {
  const canRemove = siblingCount > 1;
  const dimmed = activeDragPath != null && !pathsEqual(activeDragPath, path);

  if (node.kind === "swim_interval") {
    const swimSet = node as SwimIntervalSet;
    return (
      <DraggableNodeShell path={path} dimmed={dimmed}>
        <SwimIntervalSetEditor
          set={swimSet}
          poolSize={poolSize}
          displayUnit={displayUnit}
          targetView={targetView}
          canRemove={canRemove}
          onChange={(next) =>
            onTreeChange((nodes) =>
              updateAtPath(nodes, path, (n) => (n.kind === "swim_interval" ? next : n))
            )
          }
          onRemove={() => onTreeChange((nodes) => removeAtPath(nodes, path))}
        />
      </DraggableNodeShell>
    );
  }

  if (node.kind === "step") {
    const step = node;
    const showLap = supportsLapEnd(discipline) && lengthView === "duration";
    const lapEnd = step.duration.type === "open";

    return (
      <DraggableNodeShell path={path} dimmed={dimmed}>
        <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
        <div className="flex flex-nowrap items-end gap-2 overflow-x-auto">
          <div className="w-[7.5rem] shrink-0">
            <Label>Step type</Label>
            <Select
              value={step.intensity}
              onChange={(e) =>
                onTreeChange((nodes) =>
                  updateAtPath(nodes, path, (n) =>
                    n.kind === "step" ? { ...n, intensity: e.target.value as StepIntensity } : n
                  )
                )
              }
            >
              {STEP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {intensityLabel(t)}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[6rem] flex-1 shrink-0">
            <StepTargetField
              step={step}
              targetView={targetView}
              discipline={discipline}
              displayUnit={displayUnit}
              poolSize={poolSize}
              primaryTargetSignal={primaryTargetSignal}
              onChange={(patch) =>
                onTreeChange((nodes) =>
                  updateAtPath(nodes, path, (n) => (n.kind === "step" ? { ...n, ...patch } : n))
                )
              }
            />
          </div>
          <RangeToggle
            checked={step.target.mode === "range"}
            onChange={(checked) =>
              onTreeChange((nodes) =>
                updateAtPath(nodes, path, (n) =>
                  n.kind === "step"
                    ? {
                        ...n,
                        ...(checked
                          ? enableRangeTarget(n, targetView, discipline, primaryTargetSignal)
                          : disableRangeTarget(n, targetView, discipline, primaryTargetSignal)),
                      }
                    : n
                )
              )
            }
          />
          <div className="w-[7rem] shrink-0">
            <StepDurationInput
              duration={step.duration}
              lengthView={lengthView}
              discipline={discipline}
              displayUnit={displayUnit}
              poolSize={poolSize}
              onChange={(duration) =>
                onTreeChange((nodes) =>
                  updateAtPath(nodes, path, (n) => (n.kind === "step" ? { ...n, duration } : n))
                )
              }
            />
          </div>
          {showLap && (
            <LapEndToggle
              checked={lapEnd}
              onChange={(checked) =>
                onTreeChange((nodes) =>
                  updateAtPath(nodes, path, (n) =>
                    n.kind === "step"
                      ? {
                          ...n,
                          duration: checked
                            ? { type: "open" }
                            : { type: "time", value: 600 },
                        }
                      : n
                  )
                )
              }
            />
          )}
          <Button
            type="button"
            variant="secondary"
            className="mb-0.5 shrink-0 px-2 py-1 text-xs"
            disabled={!canRemove}
            onClick={() => onTreeChange((nodes) => removeAtPath(nodes, path))}
          >
            Remove
          </Button>
        </div>
        </div>
      </DraggableNodeShell>
    );
  }

  if (node.kind === "ramp") {
    const step = node;
    return (
      <DraggableNodeShell path={path} dimmed={dimmed}>
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Ramp
          </span>
          <Button
            type="button"
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={!canRemove}
            onClick={() => onTreeChange((nodes) => removeAtPath(nodes, path))}
          >
            Remove
          </Button>
        </div>
        <DurationEditorInput
          label="Duration"
          seconds={step.duration.value}
          onCommit={(sec) => {
            if (sec) {
              onTreeChange((nodes) =>
                updateAtPath(nodes, path, (n) =>
                  n.kind === "ramp" ? { ...n, duration: { type: "time", value: sec } } : n
                )
              );
            }
          }}
        />
        {targetView === "zone" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Start zone</Label>
              <Input
                type="number"
                min={1}
                max={7}
                value={step.target.lowZone ?? step.target.low}
                onChange={(e) => {
                  const low = Number(e.target.value);
                  if (low >= 1 && low <= 7) {
                    const signal =
                      discipline === "RUN" || discipline === "SWIM"
                        ? "pace"
                        : discipline === "STRENGTH"
                          ? "heart_rate"
                          : "power";
                    onTreeChange((nodes) =>
                      updateAtPath(nodes, path, (n) =>
                        n.kind === "ramp"
                          ? {
                              ...n,
                              target: {
                                ...n.target,
                                signal,
                                low,
                                lowZone: low,
                              },
                            }
                          : n
                      )
                    );
                  }
                }}
              />
            </div>
            <div>
              <Label>End zone</Label>
              <Input
                type="number"
                min={1}
                max={7}
                value={step.target.highZone ?? step.target.high}
                onChange={(e) => {
                  const high = Number(e.target.value);
                  if (high >= 1 && high <= 7) {
                    const signal =
                      discipline === "RUN" || discipline === "SWIM"
                        ? "pace"
                        : discipline === "STRENGTH"
                          ? "heart_rate"
                          : "power";
                    onTreeChange((nodes) =>
                      updateAtPath(nodes, path, (n) =>
                        n.kind === "ramp"
                          ? {
                              ...n,
                              target: {
                                ...n.target,
                                signal,
                                high,
                                highZone: high,
                              },
                            }
                          : n
                      )
                    );
                  }
                }}
              />
            </div>
          </div>
        )}
        {targetView === "heart_rate" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Start HR zone</Label>
              <Select
                value={String(step.target.lowZone ?? step.target.low)}
                onChange={(e) => {
                  const low = Number(e.target.value);
                  onTreeChange((nodes) =>
                    updateAtPath(nodes, path, (n) =>
                      n.kind === "ramp"
                        ? {
                            ...n,
                            target: { ...n.target, signal: "heart_rate", low, lowZone: low },
                          }
                        : n
                    )
                  );
                }}
              >
                {[1, 2, 3, 4, 5].map((z) => (
                  <option key={z} value={z}>
                    HR zone {z}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>End HR zone</Label>
              <Select
                value={String(step.target.highZone ?? step.target.high)}
                onChange={(e) => {
                  const high = Number(e.target.value);
                  onTreeChange((nodes) =>
                    updateAtPath(nodes, path, (n) =>
                      n.kind === "ramp"
                        ? {
                            ...n,
                            target: { ...n.target, signal: "heart_rate", high, highZone: high },
                          }
                        : n
                    )
                  );
                }}
              >
                {[1, 2, 3, 4, 5].map((z) => (
                  <option key={z} value={z}>
                    HR zone {z}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
        {targetView === "pace_power" && discipline === "BIKE" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Start power (W)</Label>
              <Input
                type="number"
                min={1}
                step={5}
                value={step.target.low}
                onChange={(e) => {
                  const low = Number(e.target.value);
                  if (low > 0) {
                    onTreeChange((nodes) =>
                      updateAtPath(nodes, path, (n) =>
                        n.kind === "ramp"
                          ? {
                              ...n,
                              target: {
                                signal: "power",
                                mode: "range",
                                low,
                                high: n.target.high,
                              },
                            }
                          : n
                      )
                    );
                  }
                }}
              />
            </div>
            <div>
              <Label>End power (W)</Label>
              <Input
                type="number"
                min={1}
                step={5}
                value={step.target.high}
                onChange={(e) => {
                  const high = Number(e.target.value);
                  if (high > 0) {
                    onTreeChange((nodes) =>
                      updateAtPath(nodes, path, (n) =>
                        n.kind === "ramp"
                          ? {
                              ...n,
                              target: {
                                signal: "power",
                                mode: "range",
                                low: n.target.low,
                                high,
                              },
                            }
                          : n
                      )
                    );
                  }
                }}
              />
            </div>
          </div>
        )}
        {targetView === "pace_power" && (discipline === "RUN" || discipline === "SWIM") && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Start pace</Label>
              <Input
                value={stepPaceCanonicalToInput(
                  step.target.low,
                  discipline as PlanDiscipline,
                  displayUnit,
                  poolSize
                )}
                onChange={(e) => {
                  const pace = stepPaceInputToCanonical(
                    e.target.value,
                    discipline as PlanDiscipline,
                    displayUnit,
                    poolSize
                  );
                  if (pace) {
                    onTreeChange((nodes) =>
                      updateAtPath(nodes, path, (n) =>
                        n.kind === "ramp"
                          ? {
                              ...n,
                              target: {
                                signal: "pace",
                                mode: "range",
                                low: pace,
                                high: n.target.high,
                              },
                            }
                          : n
                      )
                    );
                  }
                }}
              />
            </div>
            <div>
              <Label>End pace</Label>
              <Input
                value={stepPaceCanonicalToInput(
                  step.target.high,
                  discipline as PlanDiscipline,
                  displayUnit,
                  poolSize
                )}
                onChange={(e) => {
                  const pace = stepPaceInputToCanonical(
                    e.target.value,
                    discipline as PlanDiscipline,
                    displayUnit,
                    poolSize
                  );
                  if (pace) {
                    onTreeChange((nodes) =>
                      updateAtPath(nodes, path, (n) =>
                        n.kind === "ramp"
                          ? {
                              ...n,
                              target: {
                                signal: "pace",
                                mode: "range",
                                low: n.target.low,
                                high: pace,
                              },
                            }
                          : n
                      )
                    );
                  }
                }}
              />
            </div>
          </div>
        )}
        </div>
      </DraggableNodeShell>
    );
  }

  const block = node as RepeatBlock;
  return (
    <DraggableNodeShell path={path} dimmed={dimmed}>
      <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
          Repeat × {block.repeatCount}
        </span>
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1 text-xs"
          disabled={!canRemove}
          onClick={() => onTreeChange((nodes) => removeAtPath(nodes, path))}
        >
          Remove
        </Button>
      </div>
      <div>
        <Label>Repeat count</Label>
        <Input
          type="number"
          min={1}
          max={99}
          value={block.repeatCount}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= 1) {
              onTreeChange((nodes) =>
                updateAtPath(nodes, path, (node) =>
                  node.kind === "repeat" ? { ...node, repeatCount: n } : node
                )
              );
            }
          }}
        />
      </div>
      <div className="space-y-0 border-l-2 border-sky-300 pl-3 dark:border-sky-800">
        <WorkoutNodeList
          parentPath={path}
          nodes={block.children}
          discipline={discipline}
          displayUnit={displayUnit}
          poolSize={poolSize}
          targetView={targetView}
          lengthView={lengthView}
          primaryTargetSignal={primaryTargetSignal}
          activeDragPath={activeDragPath}
          onTreeChange={onTreeChange}
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-2 text-xs"
          onClick={() =>
            onTreeChange((nodes) =>
              updateAtPath(nodes, path, (node) =>
                node.kind === "repeat"
                  ? {
                      ...node,
                      children: [
                        ...node.children,
                        applyTargetView(
                          applyLengthView(defaultLeafStep(), lengthView),
                          targetView,
                          discipline,
                          primaryTargetSignal
                        ),
                      ],
                    }
                  : node
              )
            )
          }
        >
          Add child step
        </Button>
      </div>
      </div>
    </DraggableNodeShell>
  );
}

function WorkoutNodeList({
  parentPath,
  nodes,
  discipline,
  displayUnit,
  poolSize,
  targetView,
  lengthView,
  primaryTargetSignal,
  activeDragPath,
  onTreeChange,
}: {
  parentPath: number[];
  nodes: WorkoutNode[];
  discipline: Discipline;
  displayUnit: DisplayUnit;
  poolSize: PoolSize | null;
  targetView: TargetView;
  lengthView: LengthView;
  primaryTargetSignal: ReturnType<typeof primarySignalForDiscipline>;
  activeDragPath: number[] | null;
  onTreeChange: (updater: (nodes: WorkoutNode[]) => WorkoutNode[]) => void;
}) {
  const dragging = activeDragPath != null;

  return (
    <>
      <WorkoutDropSlot parentPath={parentPath} index={0} active={dragging} />
      {nodes.map((node, index) => {
        const path = [...parentPath, index];
        return (
          <div key={pathKey(path)}>
            <NodeEditor
              node={node}
              discipline={discipline}
              displayUnit={displayUnit}
              poolSize={poolSize}
              targetView={targetView}
              lengthView={lengthView}
              primaryTargetSignal={primaryTargetSignal}
              path={path}
              siblingCount={nodes.length}
              activeDragPath={activeDragPath}
              onTreeChange={onTreeChange}
            />
            <WorkoutDropSlot parentPath={parentPath} index={index + 1} active={dragging} />
          </div>
        );
      })}
    </>
  );
}

export function WorkoutTreeEditor({
  discipline,
  displayUnit,
  poolSize,
  tree,
  onChange,
  thresholdPaceSeconds = null,
  primarySignal = null,
  compact = false,
}: WorkoutTreeEditorProps) {
  const primaryTargetSignal = useMemo(
    () => resolvePrimaryTargetSignal(discipline, primarySignal),
    [discipline, primarySignal]
  );
  const totalSeconds = totalTreeDurationSeconds(tree.nodes, thresholdPaceSeconds);
  const totalLabel = totalSeconds > 0 ? formatDurationSeconds(totalSeconds) : "0s";
  const [activeDragPath, setActiveDragPath] = useState<number[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [targetView, setTargetViewState] = useState<TargetView>(() =>
    inferTargetView(tree.nodes, discipline, primarySignal)
  );
  const lengthView = useMemo(() => inferLengthView(tree.nodes), [tree.nodes]);

  useEffect(() => {
    setTargetViewState(inferTargetView(tree.nodes, discipline, primarySignal));
  }, [discipline, primarySignal]);

  const pacePowerLabel = discipline === "BIKE" ? "Power" : "Pace";

  const targetOptions: { value: TargetView; label: string }[] =
    discipline === "STRENGTH"
      ? [
          { value: "zone", label: "Zone" },
          { value: "heart_rate", label: "Heart rate" },
        ]
      : [
          { value: "zone", label: "Zone" },
          { value: "pace_power", label: pacePowerLabel },
          { value: "heart_rate", label: "Heart rate" },
        ];

  function onTreeChange(updater: (nodes: WorkoutNode[]) => WorkoutNode[]) {
    onChange({ version: 2, nodes: updater(tree.nodes) });
  }

  function setTargetView(view: TargetView) {
    setTargetViewState(view);
    onChange({
      version: 2,
      nodes: mapLeaves(tree.nodes, (step) =>
        applyTargetView(step, view, discipline, primaryTargetSignal)
      ),
    });
  }

  function setLengthView(view: LengthView) {
    onChange({
      version: 2,
      nodes: mapLeaves(tree.nodes, (step) => applyLengthView(step, view)),
    });
  }

  function newLeafStep(): LeafStep {
    return applyTargetView(
      applyLengthView(defaultLeafStep(), lengthView),
      targetView,
      discipline,
      primaryTargetSignal
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragPath(parseNodeDragId(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragPath(null);
    const fromPath = parseNodeDragId(event.active.id);
    if (!fromPath || !event.over) return;
    const slot = parseSlotDragId(event.over.id);
    if (!slot) return;
    onTreeChange((nodes) =>
      moveWorkoutNode(nodes, fromPath, slot.parentPath, slot.index)
    );
  }

  const draggedNode =
    activeDragPath != null ? getNodeAtPath(tree.nodes, activeDragPath) : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
      <div className="grid gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-700 sm:grid-cols-2">
        <SegmentedControl
          label="Target"
          value={targetView}
          options={targetOptions}
          onChange={setTargetView}
        />
        <SegmentedControl
          label="Step length"
          value={lengthView}
          options={[
            { value: "duration", label: "Duration" },
            { value: "distance", label: "Distance" },
          ]}
          onChange={setLengthView}
        />
      </div>

      <p className="text-sm text-zinc-500">Total estimated duration: {totalLabel}</p>

      {compact ? (
        <div className="max-h-56 space-y-3 overflow-y-auto overscroll-contain rounded-md border border-zinc-200 p-2 dark:border-zinc-700">
          <WorkoutProfileChart
            nodes={tree.nodes}
            discipline={discipline}
            lengthView={lengthView}
            primarySignal={primarySignal}
            displayUnit={displayUnit}
            thresholdPaceSeconds={thresholdPaceSeconds}
            compact
          />
          <WorkoutNodeList
            parentPath={[]}
            nodes={tree.nodes}
            discipline={discipline}
            displayUnit={displayUnit}
            poolSize={poolSize}
            targetView={targetView}
            lengthView={lengthView}
            primaryTargetSignal={primaryTargetSignal}
            activeDragPath={activeDragPath}
            onTreeChange={onTreeChange}
          />
        </div>
      ) : (
        <>
          <WorkoutProfileChart
            nodes={tree.nodes}
            discipline={discipline}
            lengthView={lengthView}
            primarySignal={primarySignal}
            displayUnit={displayUnit}
            thresholdPaceSeconds={thresholdPaceSeconds}
          />
          <WorkoutNodeList
            parentPath={[]}
            nodes={tree.nodes}
            discipline={discipline}
            displayUnit={displayUnit}
            poolSize={poolSize}
            targetView={targetView}
            lengthView={lengthView}
            primaryTargetSignal={primaryTargetSignal}
            activeDragPath={activeDragPath}
            onTreeChange={onTreeChange}
          />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => onTreeChange((nodes) => [...nodes, newLeafStep()])}>
          Add step
        </Button>
        {discipline === "SWIM" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onTreeChange((nodes) => [...nodes, defaultSwimIntervalSet()])}
          >
            Add interval set
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={() => onTreeChange((nodes) => [...nodes, defaultRepeatBlock()])}
        >
          Add repeat
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onTreeChange((nodes) => [...nodes, defaultRampStep()])}
        >
          Add ramp
        </Button>
      </div>
      </div>

      <DragOverlay>
        {draggedNode ? (
          <div className="rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-medium shadow-lg dark:border-sky-700 dark:bg-zinc-900">
            {nodeDragSummary(draggedNode, poolSize, displayUnit)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

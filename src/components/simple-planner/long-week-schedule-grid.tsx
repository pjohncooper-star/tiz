"use client";

import type { PhaseKind } from "@prisma/client";

type LongWeekScheduleGridProps = {
  startWeekIndex: number;
  endWeekIndex: number;
  phaseKind: PhaseKind;
  longRideWeekFlags: boolean[];
  longRunWeekFlags: boolean[];
  restWeekByIndex: boolean[];
  onLongRideWeekFlagsChange: (flags: boolean[]) => void;
  onLongRunWeekFlagsChange: (flags: boolean[]) => void;
};

function weekDisabled(
  weekIndex: number,
  phaseKind: PhaseKind,
  restWeekByIndex: boolean[]
): boolean {
  return phaseKind === "TAPER" || (restWeekByIndex[weekIndex] ?? false);
}

export function LongWeekScheduleGrid({
  startWeekIndex,
  endWeekIndex,
  phaseKind,
  longRideWeekFlags,
  longRunWeekFlags,
  restWeekByIndex,
  onLongRideWeekFlagsChange,
  onLongRunWeekFlagsChange,
}: LongWeekScheduleGridProps) {
  const weekIndices = Array.from(
    { length: endWeekIndex - startWeekIndex + 1 },
    (_, offset) => startWeekIndex + offset
  );

  function toggleFlag(
    flags: boolean[],
    weekIndex: number,
    checked: boolean,
    onChange: (flags: boolean[]) => void
  ) {
    const next = [...flags];
    while (next.length <= weekIndex) {
      next.push(true);
    }
    next[weekIndex] = checked;
    onChange(next);
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="pr-3 pb-2 text-left font-normal text-zinc-500" scope="col" />
            {weekIndices.map((weekIndex) => (
              <th
                key={weekIndex}
                className="px-2 pb-2 text-center text-xs font-medium text-zinc-500"
                scope="col"
              >
                Wk {weekIndex + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              {
                label: "Long bike",
                flags: longRideWeekFlags,
                onChange: onLongRideWeekFlagsChange,
              },
              {
                label: "Long run",
                flags: longRunWeekFlags,
                onChange: onLongRunWeekFlagsChange,
              },
            ] as const
          ).map((row) => (
            <tr key={row.label}>
              <th
                className="pr-3 py-1 text-left text-sm font-normal text-zinc-700 dark:text-zinc-300"
                scope="row"
              >
                {row.label}
              </th>
              {weekIndices.map((weekIndex) => {
                const disabled = weekDisabled(weekIndex, phaseKind, restWeekByIndex);
                const checked = disabled ? false : (row.flags[weekIndex] ?? true);
                return (
                  <td key={weekIndex} className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-zinc-300"
                      checked={checked}
                      disabled={disabled}
                      aria-label={`${row.label} week ${weekIndex + 1}`}
                      onChange={(event) =>
                        toggleFlag(row.flags, weekIndex, event.target.checked, row.onChange)
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-zinc-500">
        Checked weeks schedule a full long session. Unchecked weeks use the off-week policy above.
        Rest and taper weeks are always off.
      </p>
    </div>
  );
}

"use client";

import type { Discipline, SessionRole, SignalType } from "@prisma/client";
import { Label, Select } from "@/components/ui";
import {
  SESSION_ROLE_LABELS,
  SESSION_ROLES,
} from "@/lib/plan/session-role";
import { allowedPrimarySignals } from "@/lib/zones/signal-preference";
import { signalLabel } from "@/lib/zones/display";
import type { RoleSignalOverrides } from "@/lib/zones/signal-preference";

const ROLE_ORDER: SessionRole[] = ["EASY", "MODERATE", "LONG", "INTENSITY"];

type Props = {
  discipline: Discipline;
  primarySignal: SignalType;
  roleSignals: RoleSignalOverrides;
  onChange: (roleSignals: RoleSignalOverrides) => void;
  disabled?: boolean;
};

export function RoleSignalOverridesEditor({
  discipline,
  primarySignal,
  roleSignals,
  onChange,
  disabled,
}: Props) {
  const options = allowedPrimarySignals(discipline);
  if (options.length < 2) return null;

  function setRole(role: SessionRole, value: string) {
    const next: RoleSignalOverrides = { ...roleSignals };
    if (!value || value === "DEFAULT" || value === primarySignal) {
      delete next[role];
    } else {
      next[role] = value as SignalType;
    }
    onChange(next);
  }

  return (
    <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        TiZ metric by session role
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Applies when a session has no structured workout (or as stream fallback).
        Structured workouts score TiZ from their step targets (watts, HR, or pace).
        Unset roles use the discipline primary ({signalLabel(primarySignal)}).
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ROLE_ORDER.filter((r) => SESSION_ROLES.includes(r)).map((role) => {
          const current = roleSignals[role];
          const selectValue =
            current && current !== primarySignal ? current : "DEFAULT";
          return (
            <div key={role}>
              <Label>{SESSION_ROLE_LABELS[role]}</Label>
              <Select
                value={selectValue}
                disabled={disabled}
                onChange={(e) => setRole(role, e.target.value)}
              >
                <option value="DEFAULT">
                  Default ({signalLabel(primarySignal)})
                </option>
                {options.map((signal) => (
                  <option key={signal} value={signal}>
                    {signalLabel(signal)}
                  </option>
                ))}
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

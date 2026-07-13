"use client";

import type { SessionRole } from "@prisma/client";
import { Button } from "@/components/ui";
import {
  SESSION_ROLE_DESCRIPTIONS,
  SESSION_ROLE_LABELS,
  SESSION_ROLES,
} from "@/lib/plan/session-role";
import { format, parseISO } from "date-fns";

type SessionRolePickerDialogProps = {
  open: boolean;
  disciplineLabel: string;
  dateKey: string;
  defaultRole?: SessionRole;
  onCancel: () => void;
  onConfirm: (role: SessionRole) => void;
};

export function SessionRolePickerDialog({
  open,
  disciplineLabel,
  dateKey,
  defaultRole = "MODERATE",
  onCancel,
  onConfirm,
}: SessionRolePickerDialogProps) {
  if (!open) return null;

  const dayLabel = format(parseISO(`${dateKey}T12:00:00`), "EEE MMM d");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-labelledby="role-picker-title"
      >
        <h3 id="role-picker-title" className="text-sm font-semibold">
          {disciplineLabel} on {dayLabel}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">Choose session role</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {SESSION_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                role === defaultRole
                  ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500/40 dark:border-sky-600 dark:bg-sky-950/40"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
              }`}
              onClick={() => onConfirm(role)}
            >
              <span className="font-medium">{SESSION_ROLE_LABELS[role]}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                {SESSION_ROLE_DESCRIPTIONS[role]}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(defaultRole)}>
            Place ({SESSION_ROLE_LABELS[defaultRole]})
          </Button>
        </div>
      </div>
    </div>
  );
}

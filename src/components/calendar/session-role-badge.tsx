"use client";

import type { SessionRole } from "@prisma/client";
import {
  SESSION_ROLE_LABELS,
  sessionRoleBadgeClass,
  sessionRoleShowsBadge,
} from "@/lib/plan/session-role";

type SessionRoleBadgeProps = {
  role: SessionRole;
  interactive?: boolean;
  onClick?: () => void;
};

export function SessionRoleBadge({ role, interactive, onClick }: SessionRoleBadgeProps) {
  if (!sessionRoleShowsBadge(role)) return null;

  const label = SESSION_ROLE_LABELS[role];
  const className = `inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sessionRoleBadgeClass(role)}`;

  if (interactive) {
    return (
      <button
        type="button"
        className={`${className} hover:opacity-90`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Session role: ${label}. Click to change.`}
        title="Change session role"
      >
        {role === "INTENSITY" ? <span aria-hidden>⚡</span> : null}
        {label}
      </button>
    );
  }

  return (
    <span className={className}>
      {role === "INTENSITY" ? <span aria-hidden>⚡</span> : null}
      {label}
    </span>
  );
}

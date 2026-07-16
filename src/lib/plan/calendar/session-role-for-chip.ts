import type { SessionRole } from "@prisma/client";
import type { UnscheduledChip } from "@/lib/plan/calendar/unscheduled-chips";

export function sessionRoleForChip(chip: UnscheduledChip): SessionRole {
  switch (chip.slotKind) {
    case "INTENSITY":
      return "INTENSITY";
    case "LONG":
      return "LONG";
    case "SUBSTITUTE_ENDURANCE":
    case "ENDURANCE":
    default:
      return "MODERATE";
  }
}

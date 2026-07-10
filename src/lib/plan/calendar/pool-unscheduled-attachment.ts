import type { GeneratedWorkout } from "@/lib/plan/calendar/generate-workouts";
import type { PoolLibraryTemplate } from "@/lib/plan/calendar/pool-library";
import type { PoolDiscipline } from "@/lib/plan/calendar/unscheduled-chips";

export type UnscheduledAttachment =
  | { kind: "library"; template: PoolLibraryTemplate }
  | { kind: "suggested"; workout: GeneratedWorkout };

export function unscheduledAttachmentLabel(attachment: UnscheduledAttachment): string {
  return attachment.kind === "library" ? attachment.template.name : attachment.workout.label;
}

export function unscheduledAttachmentDiscipline(
  attachment: UnscheduledAttachment
): PoolDiscipline {
  return attachment.kind === "library"
    ? attachment.template.discipline
    : attachment.workout.discipline;
}

export function unscheduledDisciplinesMatch(
  chipDiscipline: PoolDiscipline,
  attachment: UnscheduledAttachment
): boolean {
  return chipDiscipline === unscheduledAttachmentDiscipline(attachment);
}

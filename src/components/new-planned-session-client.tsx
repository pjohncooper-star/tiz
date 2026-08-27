"use client";

import { useRouter } from "next/navigation";
import { AddPlannedSessionForm } from "@/components/add-planned-session-form";
import { workoutHref } from "@/lib/plan/workout-href";
import type { PlanDiscipline } from "@/lib/plan/session";
import type { DisciplineUnitSettings } from "@/lib/units/discipline-settings";

type NewPlannedSessionClientProps = {
  defaultDate: string;
  weekDays: string[];
  disciplineSettings: Record<PlanDiscipline, DisciplineUnitSettings>;
  returnTo: string;
};

export function NewPlannedSessionClient({
  defaultDate,
  weekDays,
  disciplineSettings,
  returnTo,
}: NewPlannedSessionClientProps) {
  const router = useRouter();

  return (
    <AddPlannedSessionForm
      defaultDate={defaultDate}
      weekDays={weekDays}
      disciplineSettings={disciplineSettings}
      onClose={() => router.push(returnTo)}
      onCreated={(sessionId) => {
        router.push(workoutHref(sessionId, { returnTo }));
      }}
    />
  );
}

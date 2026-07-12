import { formatDateKey } from "@/lib/dates";
import { seasonPlanToSummary, type SeasonPlanSummary } from "./season-plan.server";

export function serializeSeasonSummary(
  plan: Parameters<typeof seasonPlanToSummary>[0]
): Omit<SeasonPlanSummary, "startDate" | "endDate"> & {
  startDate: string;
  endDate: string;
} {
  const summary = seasonPlanToSummary(plan);
  return {
    ...summary,
    startDate: formatDateKey(summary.startDate),
    endDate: formatDateKey(summary.endDate),
  };
}

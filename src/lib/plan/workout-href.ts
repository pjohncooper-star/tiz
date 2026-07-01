import { resolveOrCreateSessionForActivity } from "@/lib/plan/session-link";

export function workoutHref(
  sessionId: string,
  options?: { returnTo?: string }
): string {
  const base = `/workouts/${sessionId}`;
  if (!options?.returnTo) return base;
  return `${base}?returnTo=${encodeURIComponent(options.returnTo)}`;
}

export async function workoutHrefForActivity(
  athleteId: string,
  activityId: string,
  returnTo?: string
): Promise<string> {
  const { sessionId } = await resolveOrCreateSessionForActivity(athleteId, activityId);
  return workoutHref(sessionId, returnTo ? { returnTo } : undefined);
}

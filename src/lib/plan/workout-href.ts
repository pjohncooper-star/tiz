import { resolveOrCreateSessionForActivity } from "@/lib/plan/session-link";

export function workoutHref(
  sessionId: string,
  options?: { returnTo?: string }
): string {
  const base = `/workouts/${sessionId}`;
  if (!options?.returnTo) return base;
  return `${base}?returnTo=${encodeURIComponent(options.returnTo)}`;
}

/** Calendar session page when known; otherwise the activity URL that redirects there. */
export function workoutHrefForResolvedActivity(
  activityId: string,
  sessionId: string | null,
  options?: { returnTo?: string }
): string {
  if (sessionId) return workoutHref(sessionId, options);
  const base = `/activities/${activityId}`;
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

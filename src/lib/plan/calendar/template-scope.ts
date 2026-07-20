import { z } from "zod";

/**
 * Wire schema for identifying which weekly template a request targets.
 *
 * `DEFAULT` is the athlete-global template (the /calendar/template quick-apply).
 * `PHASE` is bound to a season phase; `REST` / `TEST` are one per season plan.
 * Pure (no server deps) so it can be unit-tested and shared by client + route.
 */
export const templateScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DEFAULT") }),
  z.object({ kind: z.literal("PHASE"), seasonPhaseId: z.string().min(1) }),
  z.object({ kind: z.literal("REST"), seasonPlanId: z.string().min(1) }),
  z.object({ kind: z.literal("TEST"), seasonPlanId: z.string().min(1) }),
]);

export type TemplateScopeInput = z.infer<typeof templateScopeSchema>;

/**
 * Build a scope from loose (query-string) params, defaulting to `DEFAULT`.
 * Throws (via zod) when a scoped kind is missing its required id.
 */
export function templateScopeFromParams(params: {
  kind?: string | null;
  seasonPlanId?: string | null;
  seasonPhaseId?: string | null;
}): TemplateScopeInput {
  const kind = (params.kind ?? "DEFAULT").toUpperCase();
  const raw =
    kind === "PHASE"
      ? { kind, seasonPhaseId: params.seasonPhaseId ?? "" }
      : kind === "REST" || kind === "TEST"
        ? { kind, seasonPlanId: params.seasonPlanId ?? "" }
        : { kind: "DEFAULT" };
  return templateScopeSchema.parse(raw);
}

/** Stable string key for a scope (handy as a React remount key). */
export function templateScopeKey(scope: TemplateScopeInput): string {
  switch (scope.kind) {
    case "DEFAULT":
      return "DEFAULT";
    case "PHASE":
      return `PHASE:${scope.seasonPhaseId}`;
    case "REST":
      return `REST:${scope.seasonPlanId}`;
    case "TEST":
      return `TEST:${scope.seasonPlanId}`;
  }
}

/** Query params (for a GET request) that identify a scope. */
export function templateScopeToQuery(
  scope: TemplateScopeInput
): Record<string, string> {
  switch (scope.kind) {
    case "DEFAULT":
      return { kind: "DEFAULT" };
    case "PHASE":
      return { kind: "PHASE", seasonPhaseId: scope.seasonPhaseId };
    case "REST":
      return { kind: "REST", seasonPlanId: scope.seasonPlanId };
    case "TEST":
      return { kind: "TEST", seasonPlanId: scope.seasonPlanId };
  }
}

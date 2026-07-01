/** Turn API JSON error payloads into user-facing text. */
export function readApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const error = (data as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const flatten = error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const parts: string[] = [...(flatten.formErrors ?? [])];
    for (const [field, messages] of Object.entries(flatten.fieldErrors ?? {})) {
      for (const message of messages ?? []) {
        parts.push(`${humanizeField(field)}: ${message}`);
      }
    }
    if (parts.length > 0) return parts.join(" · ");
  }
  return fallback;
}

function humanizeField(field: string): string {
  const labels: Record<string, string> = {
    name: "Name",
    discipline: "Discipline",
    componentType: "Type",
    notes: "Notes",
    steps: "Workout steps",
    label: "Progression label",
    orderIndex: "Order",
  };
  return labels[field] ?? field;
}

const TRAINERROAD_HOST = /(^|\.)trainerroad\.com$/i;

/** Convert webcal:// to https and require a TrainerRoad host. */
export function normalizeTrainerRoadIcalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withScheme = trimmed.replace(/^webcal:/i, "https:");
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!TRAINERROAD_HOST.test(parsed.hostname)) return null;

  if (parsed.port === "80") {
    parsed.protocol = "https:";
    parsed.port = "";
  } else if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }

  return parsed.toString();
}

export function trainerRoadSessionNotes(input: {
  intensityFactor: number | null;
  tss: number | null;
}): string | null {
  const parts: string[] = [];
  if (input.intensityFactor != null) {
    parts.push(`IF ${input.intensityFactor.toFixed(2)}`);
  }
  if (input.tss != null) parts.push(`TSS ${input.tss}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

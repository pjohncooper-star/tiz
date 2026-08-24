/** Unfold folded ICS lines (RFC 5545) and split VEVENT blocks. */

export type IcsEvent = {
  uid: string;
  summary: string;
  description: string;
  dtstart: string;
};

export function unfoldIcsLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const folded = normalized.split("\n");
  const lines: string[] = [];
  for (const line of folded) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (lines.length === 0) continue;
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDateKey(value: string): string | null {
  const compact = value.trim();
  const dateOnly = /^(\d{8})$/.exec(compact);
  if (dateOnly) {
    const raw = dateOnly[1]!;
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  const dateTime = /^(\d{8})T/.exec(compact);
  if (dateTime) {
    const raw = dateTime[1]!;
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return null;
}

export function parseIcsEvents(raw: string): IcsEvent[] {
  const lines = unfoldIcsLines(raw);
  const events: IcsEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const dtstart = parseIcsDateKey(current.DTSTART ?? "");
        if (dtstart) {
          events.push({
            uid: current.UID ?? "",
            summary: current.SUMMARY ?? "",
            description: current.DESCRIPTION ?? "",
            dtstart,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(";")[0]!.toUpperCase();
    current[name] = unescapeIcsText(line.slice(colon + 1));
  }

  return events;
}

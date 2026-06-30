import type { ParsedActivity } from "./types";

function formatSubSport(subSport: string): string {
  return subSport
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function formatShortDate(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric" });
}

const DISCIPLINE_LABEL: Record<ParsedActivity["discipline"], string> = {
  BIKE: "Bike",
  RUN: "Run",
  SWIM: "Swim",
};

export function buildFitActivityName(
  messages: Record<string, Array<Record<string, unknown>>>,
  session: Record<string, unknown>,
  discipline: ParsedActivity["discipline"],
  startTime: Date,
  fallbackName: string
): string {
  const workout = messages.workoutMesgs?.[0];
  const wktName = workout?.wktName ?? workout?.workoutName;
  if (typeof wktName === "string" && wktName.trim()) return wktName.trim();

  const sportMsg = messages.sportMesgs?.[0];
  const sportProfile = session.sportProfileName;
  const sportLabel =
    (typeof sportMsg?.name === "string" && sportMsg.name.trim()) ||
    (typeof sportProfile === "string" && sportProfile.trim()) ||
    DISCIPLINE_LABEL[discipline];

  const subSport = session.subSport;
  if (typeof subSport === "string" && subSport && subSport !== "generic") {
    return `${sportLabel} (${formatSubSport(subSport)})`;
  }

  if (sportLabel !== fallbackName.replace(/\.fit$/i, "")) {
    return `${sportLabel} · ${formatShortDate(startTime)}`;
  }

  return `${DISCIPLINE_LABEL[discipline]} · ${formatShortDate(startTime)}`;
}

export function buildTcxActivityName(xml: string, fallbackName: string): string {
  const name = xml.match(/<Activity[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/i)?.[1]?.trim();
  if (name) return name;
  return fallbackName.replace(/\.tcx$/i, "");
}

export function buildGpxActivityName(xml: string, fallbackName: string): string {
  const name = xml.match(/<trk>[\s\S]*?<name>([^<]+)<\/name>/i)?.[1]?.trim();
  if (name) return name;
  return fallbackName.replace(/\.gpx$/i, "");
}

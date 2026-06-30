import { gunzipEntry, parseFileFromZip } from "@/lib/import/zip";
import type { ParsedActivity } from "@/lib/import/types";

const SUPPORTED_EXTENSIONS = [
  ".fit",
  ".gpx",
  ".tcx",
  ".fit.gz",
  ".gpx.gz",
  ".tcx.gz",
] as const;

export function isSupportedSingleUpload(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export type SingleUploadParseResult = {
  kind: "activity";
  activities: ParsedActivity[];
};

export function parseSingleUploadFile(
  fileName: string,
  data: Uint8Array
): SingleUploadParseResult | null {
  const entry = gunzipEntry({ path: fileName, data });
  const activities = parseFileFromZip(entry);
  if (activities.length === 0) return null;
  return { kind: "activity", activities };
}

import { gunzipSync, unzip } from "fflate";
import { parseFitFile } from "./fit";
import { isNonActivityPath } from "./classify";
import { parseGpxFile } from "./gpx";
import { parseTcxFile } from "./tcx";
import type { ParsedActivity } from "./types";

export type ZipEntry = { path: string; data: Uint8Array };

const MAX_NESTED_ZIP_DEPTH = 4;

function isActivityFile(path: string): boolean {
  const n = path.toLowerCase();
  return (
    n.endsWith(".fit") ||
    n.endsWith(".tcx") ||
    n.endsWith(".gpx") ||
    n.endsWith(".fit.gz") ||
    n.endsWith(".tcx.gz") ||
    n.endsWith(".gpx.gz")
  );
}

/** Decompress .gz activity files (TrainingPeaks / Garmin bulk exports). */
export function gunzipEntry(entry: ZipEntry): ZipEntry {
  const lower = entry.path.toLowerCase();
  if (!lower.endsWith(".gz")) return entry;
  try {
    return {
      path: entry.path.replace(/\.gz$/i, ""),
      data: gunzipSync(entry.data),
    };
  } catch {
    return entry;
  }
}

export function normalizeImportEntries(entries: ZipEntry[]): ZipEntry[] {
  return entries.map(gunzipEntry).filter((e) => !shouldSkipPath(e.path));
}

function shouldSkipPath(path: string): boolean {
  const parts = path.split("/");
  return parts.some((p) => p.startsWith(".") || p === "__MACOSX");
}

export async function extractZip(buffer: Uint8Array): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    unzip(buffer, (err, files) => {
      if (err) return reject(err);
      const entries: ZipEntry[] = Object.entries(files).map(([path, data]) => ({
        path,
        data,
      }));
      resolve(entries);
    });
  });
}

/** Unzip outer archive and any nested per-activity .zip files (Garmin/Strava bulk exports). */
export async function extractZipNested(
  buffer: Uint8Array,
  prefix = "",
  depth = 0
): Promise<ZipEntry[]> {
  const entries = await extractZip(buffer);
  const flat: ZipEntry[] = [];

  for (const entry of entries) {
    if (shouldSkipPath(entry.path)) continue;

    const fullPath = prefix
      ? `${prefix}/${entry.path.replace(/^\/+/, "")}`
      : entry.path.replace(/^\/+/, "");

    if (fullPath.toLowerCase().endsWith(".zip") && depth < MAX_NESTED_ZIP_DEPTH) {
      try {
        const nested = await extractZipNested(
          entry.data,
          fullPath.replace(/\.zip$/i, ""),
          depth + 1
        );
        flat.push(...nested);
      } catch {
        // Not a readable zip; keep as opaque file.
        flat.push({ path: fullPath, data: entry.data });
      }
      continue;
    }

    flat.push({ path: fullPath, data: entry.data });
  }

  return flat;
}

export function parseFileFromZip(entry: ZipEntry): ParsedActivity[] {
  const name = entry.path.split("/").pop() ?? entry.path;
  const lower = name.toLowerCase();
  const text = new TextDecoder();

  if (isNonActivityPath(entry.path)) return [];
  if (lower.endsWith(".fit")) return parseFitFile(entry.data, name, entry.path);
  if (lower.endsWith(".tcx")) {
    const parsed = parseTcxFile(text.decode(entry.data), name);
    return parsed ? [parsed] : [];
  }
  if (lower.endsWith(".gpx")) {
    const parsed = parseGpxFile(text.decode(entry.data), name);
    return parsed ? [parsed] : [];
  }
  return [];
}

export function listImportableFiles(entries: ZipEntry[]): ZipEntry[] {
  return entries.filter((e) => isActivityFile(e.path));
}

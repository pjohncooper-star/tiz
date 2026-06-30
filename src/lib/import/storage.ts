import fs from "fs/promises";
import path from "path";
import type { ZipEntry } from "./zip";
import {
  extractZipNested,
  listImportableFiles,
  normalizeImportEntries,
  parseFileFromZip,
} from "./zip";

const IMPORT_ROOT = path.join(process.cwd(), ".data", "imports");
const UPLOAD_ZIP_NAME = "upload.zip";

function jobDir(jobId: string) {
  return path.join(IMPORT_ROOT, jobId);
}

/** Persist the raw upload so zip scanning can run off the request thread. */
export async function saveUploadZip(jobId: string, buffer: Uint8Array) {
  const dir = jobDir(jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, UPLOAD_ZIP_NAME), buffer);
}

/** Extract nested zips and write per-activity staging files. */
export async function stageFromUploadZip(jobId: string): Promise<number> {
  const zipPath = path.join(jobDir(jobId), UPLOAD_ZIP_NAME);
  const buffer = new Uint8Array(await fs.readFile(zipPath));
  const entries = normalizeImportEntries(await extractZipNested(buffer));
  const count = await stageImportFiles(jobId, entries);
  await fs.unlink(zipPath).catch(() => {});
  return count;
}

/** Write importable activity files to disk; return count staged. */
export async function stageImportFiles(jobId: string, entries: ZipEntry[]): Promise<number> {
  const dir = jobDir(jobId);
  await fs.mkdir(dir, { recursive: true });

  const importable = listImportableFiles(entries);
  const manifest: string[] = [];

  for (let i = 0; i < importable.length; i++) {
    const entry = importable[i];
    const safeName = `${i.toString().padStart(5, "0")}_${path.basename(entry.path)}`;
    await fs.writeFile(path.join(dir, safeName), entry.data);
    manifest.push(safeName);
  }

  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return manifest.length;
}

export async function readImportManifest(jobId: string): Promise<string[]> {
  const raw = await fs.readFile(path.join(jobDir(jobId), "manifest.json"), "utf8");
  return JSON.parse(raw) as string[];
}

export async function parseStagedFile(jobId: string, stagedName: string) {
  const data = new Uint8Array(await fs.readFile(path.join(jobDir(jobId), stagedName)));
  const originalName = stagedName.replace(/^\d+_/, "");
  return parseFileFromZip({ path: originalName, data });
}

export async function cleanupImport(jobId: string) {
  await fs.rm(jobDir(jobId), { recursive: true, force: true });
}

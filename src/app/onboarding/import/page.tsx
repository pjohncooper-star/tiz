"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OnboardingBack } from "@/components/onboarding-nav";
import { Button, Card, Label, Select } from "@/components/ui";

type Job = {
  id: string;
  status: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  errorLog?: string[] | null;
};

export default function ImportStep() {
  const router = useRouter();
  const [source, setSource] = useState("GARMIN_EXPORT");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshJobs() {
      if (uploading) return;
      try {
        const r = await fetch("/api/import", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setJobs(d.jobs ?? []);
      } catch {
        // Dev server may be busy scanning a large zip — keep last known state.
      }
    }

    refreshJobs();
    const id = setInterval(refreshJobs, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [uploading]);

  const latest = jobs[0];
  const scanning =
    !!latest &&
    latest.totalFiles === 0 &&
    (latest.status === "PENDING" || latest.status === "PROCESSING");
  const progress =
    latest && latest.totalFiles > 0
      ? Math.round((latest.processedFiles / latest.totalFiles) * 100)
      : 0;
  const parsingDone =
    !!latest &&
    latest.totalFiles > 0 &&
    latest.processedFiles + latest.failedFiles >= latest.totalFiles;
  const uploadDisabled =
    uploading || (latest?.status === "PROCESSING" && !scanning);

  useEffect(() => {
    if (latest?.status === "COMPLETE") {
      fetch("/api/import", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backfillZones: true }),
      }).catch(() => {});
    }
  }, [latest?.status]);

  async function finishImport() {
    setUploadError("");
    const res = await fetch("/api/import", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finish: true, jobId: latest?.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setUploadError(data.error ?? "Could not finish import");
      return;
    }
    const list = await fetch("/api/import").then((r) => r.json());
    setJobs(list.jobs ?? []);
  }

  async function uploadFile(file: File) {
    const isZip =
      file.name.toLowerCase().endsWith(".zip") ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed";
    if (!isZip) {
      setUploadError("Please upload a .zip file.");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source", source);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 413) {
          setUploadError("File is too large for the server limit. Try a smaller date range.");
        } else {
          setUploadError(data.error ?? `Upload failed (${res.status})`);
        }
        return;
      }
      const list = await fetch("/api/import").then((r) => r.json());
      setJobs(list.jobs ?? []);
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = "";
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (uploadDisabled) return;
    dragDepthRef.current += 1;
    setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (uploadDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  async function clearQueue() {
    setUploadError("");
    const res = await fetch("/api/import", { method: "DELETE" });
    if (!res.ok) {
      setUploadError("Could not clear the queue");
      return;
    }
    setJobs([]);
  }

  async function retryImport() {
    setUploadError("");
    const res = await fetch("/api/import", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: latest?.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setUploadError(data.error ?? "Could not start import");
    }
  }

  return (
    <div className="space-y-6">
      <OnboardingBack current="IMPORT" />
      <div>
        <h1 className="text-2xl font-semibold">Step 4 — Historical import</h1>
        <p className="text-sm text-zinc-500">
          Zip your export folder, then upload the .zip file. Supports loose activity
          files, nested per-activity zips, and TrainingPeaks-style{" "}
          <code className="text-xs">.FIT.gz</code> files.
        </p>
      </div>
      <Card title="Upload">
        <div className="mb-3">
          <Label>Export source</Label>
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="GARMIN_EXPORT">Garmin Connect export</option>
            <option value="STRAVA_EXPORT">Strava bulk export</option>
            <option value="TRAININGPEAKS_EXPORT">TrainingPeaks export</option>
          </Select>
          <p className="mt-1 text-xs text-zinc-500">
            Labels this import batch for your records. Parsing is the same for all
            sources today; source-specific handling may be added later.
          </p>
        </div>
        <div
          role="button"
          tabIndex={uploadDisabled ? -1 : 0}
          onClick={() => {
            if (!uploadDisabled) fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (uploadDisabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
            uploadDisabled
              ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-950"
              : dragActive
                ? "border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/40"
                : "border-zinc-300 bg-zinc-50/80 hover:border-sky-400 hover:bg-sky-50/50 dark:border-zinc-700 dark:bg-zinc-950/60 dark:hover:border-sky-500"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onFileInputChange}
            disabled={uploadDisabled}
            className="sr-only"
          />
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {dragActive ? "Drop your zip here" : "Drag and drop your export zip"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">or click to browse</p>
        </div>
        {uploading && (
          <p className="mt-2 text-sm text-zinc-600">
            Uploading and scanning zip — large exports can take a minute…
          </p>
        )}
        {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
        {latest && (
          <div className="mt-3 space-y-2 text-sm text-zinc-600">
            <p>
              <span className="font-medium">{latest.status}</span>:{" "}
              {latest.processedFiles} of {latest.totalFiles} activities processed
              {latest.failedFiles > 0 && ` (${latest.failedFiles} skipped)`}
            </p>
            {scanning && (
              <p className="text-zinc-600">
                Scanning zip — large exports can take a minute…
              </p>
            )}
            {latest.status === "PROCESSING" && latest.totalFiles > 0 && !parsingDone && (
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full bg-sky-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            {latest.status === "PROCESSING" && parsingDone && (
              <div className="space-y-2">
                <p className="text-zinc-600">
                  All {latest.totalFiles} files parsed ({latest.processedFiles} imported,{" "}
                  {latest.failedFiles} skipped). Zone calculation continues in the background.
                </p>
                <Button type="button" onClick={finishImport}>
                  Continue to Strava connect
                </Button>
              </div>
            )}
            {latest.status === "PENDING" && (
              <div className="space-y-2">
                <p className="text-zinc-600">Starting import…</p>
                <Button type="button" variant="secondary" onClick={retryImport}>
                  Start import now
                </Button>
              </div>
            )}
            {latest.status === "FAILED" && latest.errorLog && (
              <p className="text-red-600">
                {Array.isArray(latest.errorLog) ? latest.errorLog[0] : "Import failed"}
              </p>
            )}
          </div>
        )}
        {latest?.status === "COMPLETE" && (
          <Button className="mt-4" onClick={() => router.push("/onboarding/strava")}>
            Continue to Strava connect
          </Button>
        )}
        {jobs.length > 0 && (
          <Button className="mt-4" variant="secondary" onClick={clearQueue}>
            Clear upload queue
          </Button>
        )}
        <p className="mt-3 text-sm">
          <Link href="/api/onboarding/skip-import" className="text-sky-600">
            Skip for now
          </Link>
        </p>
      </Card>
    </div>
  );
}

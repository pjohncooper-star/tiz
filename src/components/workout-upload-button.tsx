"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

const ACCEPT = ".fit,.gpx,.tcx,.fit.gz,.gpx.gz,.tcx.gz";

type WorkoutUploadButtonProps = {
  onUploaded?: () => void;
  scheduledDate?: string;
  className?: string;
};

export function WorkoutUploadButton({
  onUploaded,
  scheduledDate,
  className = "",
}: WorkoutUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      if (scheduledDate) {
        form.append("scheduledDate", scheduledDate);
      }

      const res = await fetch("/api/import/single", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.error === "string" ? data.error : "Upload failed");
        return;
      }

      onUploaded?.();
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}

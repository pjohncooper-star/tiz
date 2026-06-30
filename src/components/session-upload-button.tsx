"use client";

import { useRouter } from "next/navigation";
import { WorkoutUploadButton } from "@/components/workout-upload-button";

type SessionUploadButtonProps = {
  scheduledDate: string;
};

export function SessionUploadButton({ scheduledDate }: SessionUploadButtonProps) {
  const router = useRouter();

  return (
    <WorkoutUploadButton
      scheduledDate={scheduledDate}
      onUploaded={() => router.refresh()}
    />
  );
}

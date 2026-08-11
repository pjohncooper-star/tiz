"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Props = {
  completeType: "complete-thresholds" | "complete-historical-thresholds";
  nextHref: string;
  label: string;
};

export function OnboardingContinueButton({ completeType, nextHref, label }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function continueOnboarding() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: completeType }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not continue");
      }
      router.push(nextHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="button" disabled={saving} onClick={() => void continueOnboarding()}>
        {saving ? "Continuing…" : label}
      </Button>
    </div>
  );
}

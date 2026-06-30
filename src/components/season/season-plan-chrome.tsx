"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { SeasonPlanSidebar } from "@/components/season/season-plan-sidebar";
import { useSearchParams } from "next/navigation";

type SeasonMeta = {
  name: string;
  status: string;
};

function SeasonPlanChromeInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const seasonId = searchParams.get("seasonId");
  const [meta, setMeta] = useState<SeasonMeta | null>(null);

  const loadMeta = useCallback(async () => {
    const url = seasonId
      ? `/api/plan/season?seasonId=${encodeURIComponent(seasonId)}`
      : "/api/plan/season";
    const res = await fetch(url);
    if (!res.ok) return;
    const data = (await res.json()) as { season: { name: string; status: string } | null };
    if (data.season) {
      setMeta({ name: data.season.name, status: data.season.status });
    }
  }, [seasonId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  return (
    <div className="flex gap-8">
      <SeasonPlanSidebar seasonName={meta?.name} seasonStatus={meta?.status} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SeasonPlanChrome({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-w-0 flex-1">{children}</div>}>
      <SeasonPlanChromeInner>{children}</SeasonPlanChromeInner>
    </Suspense>
  );
}

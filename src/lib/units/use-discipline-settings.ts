"use client";

import { useEffect, useState } from "react";
import {
  buildDisciplineSettings,
  DEFAULT_DISCIPLINE_UNIT_SETTINGS,
  type DisciplineUnitSettings,
} from "@/lib/units/discipline-settings";
import type { PlanDiscipline } from "@/lib/plan/session";

type SettingsResponse = {
  settings?: Array<{
    discipline: string;
    displayUnit: "METRIC" | "IMPERIAL";
    poolSize: "SCY" | "SCM" | "LCM" | null;
  }>;
};

export function useDisciplineSettings() {
  const [disciplineSettings, setDisciplineSettings] = useState<
    Record<PlanDiscipline, DisciplineUnitSettings>
  >(DEFAULT_DISCIPLINE_UNIT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = (await res.json()) as SettingsResponse;
        if (cancelled) return;
        setDisciplineSettings(
          buildDisciplineSettings(
            (data.settings ?? []).map((row) => ({
              discipline: row.discipline,
              displayUnit: row.displayUnit,
              poolSize: row.poolSize,
            }))
          )
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { disciplineSettings, loading };
}

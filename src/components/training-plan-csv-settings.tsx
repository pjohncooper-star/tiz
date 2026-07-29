"use client";

import { useState } from "react";
import { CalendarCsvImportSettings } from "@/components/calendar-csv-import-settings";
import { TrainingPlansLibrarySettings } from "@/components/training-plans-settings";

export function TrainingPlanCsvSettings() {
  const [libraryKey, setLibraryKey] = useState(0);

  return (
    <div className="space-y-8">
      <CalendarCsvImportSettings onPlanSaved={() => setLibraryKey((k) => k + 1)} />
      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Training plan library
        </h3>
        <TrainingPlansLibrarySettings refreshKey={libraryKey} />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { format, startOfWeek } from "date-fns";
import { Button, Card, Input, Label } from "@/components/ui";
import { AnchorEditor } from "@/components/season/anchor-editor";
import { WEEK_OPTS } from "@/lib/dates";
import { useState } from "react";

export function PlanAnchorWorkoutsView() {
  const [error, setError] = useState<string | null>(null);
  const [materializing, setMaterializing] = useState(false);
  const [materializeWeek, setMaterializeWeek] = useState(() =>
    format(startOfWeek(new Date(), WEEK_OPTS), "yyyy-MM-dd")
  );

  async function handleMaterialize() {
    setMaterializing(true);
    setError(null);
    const res = await fetch("/api/plan/anchors/materialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: materializeWeek }),
    });
    setMaterializing(false);
    if (!res.ok) {
      setError("Could not materialize anchors for that week");
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Recurring weekly workouts that appear on your{" "}
        <Link href="/calendar" className="text-sky-600 hover:underline dark:text-sky-400">
          calendar
        </Link>
        . For full season planning, use the{" "}
        <Link href="/plan" className="text-sky-600 hover:underline dark:text-sky-400">
          season planner
        </Link>
        .
      </p>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <Card title="Materialize week">
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Create or refresh anchored sessions on the calendar for a Monday-start week.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <Label>Week starting (Monday)</Label>
            <Input
              type="date"
              value={materializeWeek}
              onChange={(e) => setMaterializeWeek(e.target.value)}
            />
          </div>
          <Button type="button" onClick={() => void handleMaterialize()} disabled={materializing}>
            {materializing ? "Materializing…" : "Materialize this week"}
          </Button>
        </div>
      </Card>

      <AnchorEditor />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

type SeasonListItem = {
  id: string;
  name: string;
  status: string;
  totalWeeks: number;
  startDate: string;
  endDate: string;
  totalPlannedHours: number;
};

export function SeasonsList({ newSeasonHref }: { newSeasonHref: string }) {
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/plan/seasons");
    if (res.ok) {
      const data = (await res.json()) as { seasons: SeasonListItem[] };
      setSeasons(data.seasons);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleArchive(id: string) {
    if (!window.confirm("Archive this season?")) return;
    const res = await fetch(`/api/plan/season/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      window.alert(body?.error ?? "Could not archive season.");
      return;
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Seasons</h1>
          <p className="text-sm text-zinc-500">Manage your training seasons.</p>
        </div>
        <Link
          href={newSeasonHref}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          New season
        </Link>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No seasons yet.{" "}
            <Link href={newSeasonHref} className="text-sky-600 hover:underline dark:text-sky-400">
              Set up your first season
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {seasons.map((season) => (
              <li key={season.id} className="flex items-start justify-between gap-3 py-4 first:pt-0">
                <div>
                  <Link
                    href={`/plan?seasonId=${encodeURIComponent(season.id)}`}
                    className="font-medium text-zinc-900 hover:text-sky-600 dark:text-zinc-100 dark:hover:text-sky-400"
                  >
                    {season.name}
                  </Link>
                  <p className="text-sm text-zinc-500">
                    {season.startDate} → {season.endDate} · {season.totalWeeks} weeks ·{" "}
                    {season.totalPlannedHours} h planned
                  </p>
                  <p className="text-xs capitalize text-zinc-400">{season.status.toLowerCase()}</p>
                </div>
                <Button type="button" variant="secondary" onClick={() => void handleArchive(season.id)}>
                  Archive
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

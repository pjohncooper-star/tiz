"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import type { SimpleSeason } from "@/components/simple-planner/simple-planner-types";

export function SimplePlannerHeader({
  season,
  trainerRoadCalendarSaved,
  trainerRoadBusy,
  trainerRoadSyncedAt,
  onFollowTrainerRoad,
  onStopFollowingTrainerRoad,
  onRefreshTrainerRoad,
  seasons,
  onSelectSeason,
}: {
  season: SimpleSeason;
  trainerRoadCalendarSaved: boolean;
  trainerRoadBusy: boolean;
  trainerRoadSyncedAt: string | null;
  onFollowTrainerRoad: () => void;
  onStopFollowingTrainerRoad: () => void;
  onRefreshTrainerRoad: () => void;
  seasons: Array<{ id: string; name: string }>;
  onSelectSeason?: () => void;
}) {
  const following = Boolean(season.trainerRoadDriven);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">
            {onSelectSeason ? (
              <button type="button" className="text-left hover:underline" onClick={onSelectSeason}>
                {season.name}
              </button>
            ) : (
              season.name
            )}
          </h1>
          {following ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
              Following TrainerRoad
            </span>
          ) : null}
        </div>
        <p className="text-sm text-zinc-500">
          {season.startDate} → {season.endDate} · {season.totalWeeks} weeks
        </p>
        {following && trainerRoadSyncedAt ? (
          <p className="text-xs text-zinc-500">
            Last synced {new Date(trainerRoadSyncedAt).toLocaleString()}
          </p>
        ) : null}
        {seasons.length > 1 ? (
          <label className="mt-2 block text-xs text-zinc-500 lg:hidden">
            Season
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={season.id}
              onChange={(event) => {
                window.location.assign(`/plan?seasonId=${encodeURIComponent(event.target.value)}`);
              }}
            >
              {seasons.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {following ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={trainerRoadBusy}
              onClick={onRefreshTrainerRoad}
            >
              {trainerRoadBusy ? "Refreshing…" : "Refresh feed"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={trainerRoadBusy}
              onClick={onStopFollowingTrainerRoad}
            >
              {trainerRoadBusy ? "Updating…" : "Stop following"}
            </Button>
          </>
        ) : trainerRoadCalendarSaved ? (
          <Button
            type="button"
            variant="secondary"
            disabled={trainerRoadBusy}
            onClick={onFollowTrainerRoad}
          >
            {trainerRoadBusy ? "Updating…" : "Follow TrainerRoad"}
          </Button>
        ) : (
          <Link
            href="/settings/integrations"
            className="text-xs text-sky-600 hover:underline"
          >
            Connect TrainerRoad in Settings
          </Link>
        )}
        <Link
          href="/library/training-plans"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Programs
        </Link>
        <Link
          href="/plan/seasons"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          All seasons
        </Link>
        <Link
          href="/plan?new=1"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          New season
        </Link>
      </div>
    </div>
  );
}

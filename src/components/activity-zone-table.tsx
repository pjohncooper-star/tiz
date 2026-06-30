import type { Discipline, SignalType, ThresholdProfile } from "@prisma/client";
import {
  formatThresholdLabel,
  signalLabel,
  zonePercentages,
  zoneRangesForProfile,
} from "@/lib/zones/display";

type ZoneRow = {
  zone: number;
  minutes: number;
  signalUsed: SignalType;
  usedFallback: boolean;
};

type ActivityZoneTableProps = {
  rows: ZoneRow[];
  profile: ThresholdProfile;
  discipline: Discipline;
  displayUnit: "METRIC" | "IMPERIAL";
};

export function ActivityZoneTable({
  rows,
  profile,
  discipline,
  displayUnit,
}: ActivityZoneTableProps) {
  const rangeByZone = new Map(
    zoneRangesForProfile(profile, discipline, displayUnit).map((r) => [
      r.zone,
      r.label,
    ])
  );
  const pctByZone = zonePercentages(rows);
  const signal = rows[0]?.signalUsed ?? profile.signalType;
  const usedFallback = rows.some((r) => r.usedFallback);

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        {signalLabel(signal)}
        {usedFallback ? " (fallback)" : ""} · threshold{" "}
        {formatThresholdLabel(profile, discipline, displayUnit)}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 text-left text-zinc-500 dark:border-zinc-800">
            <th className="pb-2 font-medium">Zone</th>
            <th className="pb-2 font-medium">Time</th>
            <th className="pb-2 font-medium">%</th>
            <th className="pb-2 font-medium">Range</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((z) => (
            <tr
              key={z.zone}
              className="border-t border-zinc-100 dark:border-zinc-800"
            >
              <td className="py-2">Z{z.zone}</td>
              <td>{z.minutes.toFixed(1)} min</td>
              <td>{(pctByZone.get(z.zone) ?? 0).toFixed(1)}%</td>
              <td className="py-2 text-zinc-500">
                {rangeByZone.get(z.zone) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

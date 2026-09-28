"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ActivityStreamsChart } from "@/components/activity-streams-chart";
import { Card } from "@/components/ui";
import type { ActivityStreamChartData } from "@/lib/activity/resolve-activity-stream-chart";
import type { ChartCursor, ChartSelection } from "@/lib/activity/latlng";

const ActivityRouteMap = dynamic(
  () =>
    import("@/components/activity-route-map").then((m) => m.ActivityRouteMap),
  { ssr: false }
);

type ActivityWorkoutChartWithMapProps = {
  chart: ActivityStreamChartData;
  mapToken: string | null;
};

export function ActivityWorkoutChartWithMap({
  chart,
  mapToken,
}: ActivityWorkoutChartWithMapProps) {
  const [cursor, setCursor] = useState<ChartCursor | null>(null);
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  const showMap = Boolean(mapToken) && chart.hasRoute;

  return (
    <Card title={chart.chartTitle}>
      {showMap && mapToken ? (
        <ActivityRouteMap
          points={chart.points}
          token={mapToken}
          cursor={cursor}
          selection={selection}
        />
      ) : null}
      {chart.metrics ? (
        <ActivityStreamsChart
          points={chart.points}
          displayUnit={chart.displayUnit}
          discipline={chart.discipline}
          available={chart.metrics}
          overlay={chart.overlay}
          selection={selection}
          onCursorChange={setCursor}
          onSelectionChange={setSelection}
        />
      ) : null}
    </Card>
  );
}

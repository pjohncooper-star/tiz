import { CollapsibleCard } from "@/components/collapsible-card";
import { RacePaceAnchorsSettingsPanel } from "@/components/race-pace-anchors-settings-panel";
import { ThresholdHistoryEditor } from "@/components/thresholds/threshold-history-editor";
import { ThresholdsEditor } from "@/components/thresholds/thresholds-editor";
import { Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import { loadAthleteSettingsProfile } from "@/lib/settings/athlete-settings.server";
import { parseRacePaceAnchors } from "@/lib/workout/relative-pace";

export const dynamic = "force-dynamic";

export default async function ThresholdsSettingsPage() {
  const session = await requireAthlete();
  const athlete = await loadAthleteSettingsProfile(session.user.athleteId!);

  const racePaceAnchors = parseRacePaceAnchors(
    athlete && "racePaceAnchors" in athlete ? athlete.racePaceAnchors : null
  );

  return (
    <>
      <Card title="Race paces">
        <RacePaceAnchorsSettingsPanel initialAnchors={racePaceAnchors} />
      </Card>
      <ThresholdsEditor title="Current thresholds" />
      <CollapsibleCard
        title="Threshold & primary metric history"
        showLabel="Show history"
        hideLabel="Hide history"
      >
        <ThresholdHistoryEditor />
      </CollapsibleCard>
    </>
  );
}

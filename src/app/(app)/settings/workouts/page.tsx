import { SelfEvalSettingsPanel } from "@/components/self-eval-settings-panel";
import { SwimEquipmentSettingsPanel } from "@/components/swim-equipment-settings-panel";
import { Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import { loadAthleteSettingsProfile } from "@/lib/settings/athlete-settings.server";
import { parseSwimEquipmentCatalog } from "@/lib/swim/equipment-catalog";
import { parseSelfEvalConfig } from "@/lib/survey/self-eval-config";

export const dynamic = "force-dynamic";

export default async function WorkoutsSettingsPage() {
  const session = await requireAthlete();
  const athlete = await loadAthleteSettingsProfile(session.user.athleteId!);

  const swimEquipmentCatalog = parseSwimEquipmentCatalog(
    athlete && "swimEquipmentCatalog" in athlete ? athlete.swimEquipmentCatalog : null
  );
  const selfEvalConfig = parseSelfEvalConfig(athlete?.selfEvalConfig);

  return (
    <>
      <Card title="Swim equipment">
        <SwimEquipmentSettingsPanel initialCatalog={swimEquipmentCatalog} />
      </Card>
      <Card title="Self evaluation">
        <SelfEvalSettingsPanel initialConfig={selfEvalConfig} />
      </Card>
    </>
  );
}

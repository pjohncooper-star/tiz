import { EcoLoadSettingsPanel } from "@/components/eco-load-settings-panel";
import { SessionFormulaSettingsPanel } from "@/components/session-formula-settings-panel";
import { ZoneFocusSettingsPanel } from "@/components/zone-focus-settings-panel";
import { Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import { parseSessionFormulaCatalog } from "@/lib/plan/season/base-formulas";
import { parsePhaseKindZoneDefaults } from "@/lib/plan/season/phase-zone-defaults";
import { parseZoneFocusCatalog } from "@/lib/plan/season/zone-focus-catalog";
import { loadAthleteSettingsProfile } from "@/lib/settings/athlete-settings.server";

export const dynamic = "force-dynamic";

export default async function TrainingSettingsPage() {
  const session = await requireAthlete();
  const athlete = await loadAthleteSettingsProfile(session.user.athleteId!);

  const phaseKindZoneDefaults = parsePhaseKindZoneDefaults(
    athlete && "phaseKindZoneDefaults" in athlete ? athlete.phaseKindZoneDefaults : null
  );
  const zoneFocusCatalog = parseZoneFocusCatalog(
    athlete && "zoneFocusCatalog" in athlete ? athlete.zoneFocusCatalog : null
  );
  const sessionFormulaCatalog = parseSessionFormulaCatalog(
    athlete && "sessionFormulaCatalog" in athlete ? athlete.sessionFormulaCatalog : null
  );
  const ecoLoadEnabled =
    athlete && "ecoLoadEnabled" in athlete ? Boolean(athlete.ecoLoadEnabled) : false;

  return (
    <>
      <Card title="Zone focus">
        <ZoneFocusSettingsPanel
          initialSettings={{ zoneFocusCatalog, phaseKindZoneDefaults }}
        />
      </Card>
      <div id="session-formulas">
        <Card title="Session formulas">
          <SessionFormulaSettingsPanel initialCatalog={sessionFormulaCatalog} />
        </Card>
      </div>
      <Card title="Training load (ECO)">
        <EcoLoadSettingsPanel initialEnabled={ecoLoadEnabled} />
      </Card>
    </>
  );
}

import { CalendarFeedSettings } from "@/components/calendar-feed-settings";
import { Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadAthleteSettingsProfile } from "@/lib/settings/athlete-settings.server";

export const dynamic = "force-dynamic";

export default async function IntegrationsSettingsPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const [connection, athlete] = await Promise.all([
    db.stravaConnection.findUnique({ where: { athleteId } }),
    loadAthleteSettingsProfile(athleteId),
  ]);

  const calendarFeedToken =
    athlete && "calendarFeedToken" in athlete
      ? (athlete.calendarFeedToken as string | null)
      : null;

  return (
    <>
      <Card title="Strava">
        {connection ? (
          <p className="text-sm">Connected (athlete #{connection.stravaAthleteId.toString()})</p>
        ) : (
          <a
            href="/api/strava/connect?returnTo=/settings/integrations"
            className="text-sm text-sky-600"
          >
            Connect Strava
          </a>
        )}
      </Card>
      <Card title="Calendar subscription">
        <CalendarFeedSettings initialToken={calendarFeedToken} />
      </Card>
    </>
  );
}

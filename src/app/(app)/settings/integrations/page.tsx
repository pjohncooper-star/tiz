import { CalendarFeedSettings } from "@/components/calendar-feed-settings";
import { TrainerRoadSettings } from "@/components/trainerroad-settings";
import { Card } from "@/components/ui";
import { requireAthlete } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { loadAthleteSettingsProfile } from "@/lib/settings/athlete-settings.server";
import { listTrainerRoadDrivenSeasons } from "@/lib/plan/trainerroad/season.server";

export const dynamic = "force-dynamic";

async function loadTrainerRoadSettings(athleteId: string) {
  try {
    const row = await db.athlete.findUnique({
      where: { id: athleteId },
      select: {
        trainerRoadIcalUrl: true,
        trainerRoadSyncedAt: true,
      },
    });
    return {
      url: row?.trainerRoadIcalUrl ?? null,
      syncedAt: row?.trainerRoadSyncedAt?.toISOString() ?? null,
      seasons: await listTrainerRoadDrivenSeasons(athleteId),
    };
  } catch (error) {
    if (error instanceof Error && /trainerRoadIcalUrl|column/i.test(error.message)) {
      return { url: null, syncedAt: null, seasons: [] };
    }
    throw error;
  }
}

export default async function IntegrationsSettingsPage() {
  const session = await requireAthlete();
  const athleteId = session.user.athleteId!;
  const [connection, athlete, trainerRoad] = await Promise.all([
    db.stravaConnection.findUnique({ where: { athleteId } }),
    loadAthleteSettingsProfile(athleteId),
    loadTrainerRoadSettings(athleteId),
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
      <Card title="TrainerRoad">
        <TrainerRoadSettings
          initialUrl={trainerRoad.url}
          initialSyncedAt={trainerRoad.syncedAt}
          initialSeasons={trainerRoad.seasons}
        />
      </Card>
      <Card title="Calendar subscription">
        <CalendarFeedSettings initialToken={calendarFeedToken} />
      </Card>
    </>
  );
}

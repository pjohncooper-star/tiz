import "dotenv/config";
import { ensureStravaWebhookSubscription } from "../src/lib/strava/webhooks";

async function main() {
  const appUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (!appUrl) {
    console.error(
      "Set AUTH_URL to your production origin (e.g. https://tiz.example.com) before registering."
    );
    process.exit(1);
  }

  const result = await ensureStravaWebhookSubscription(appUrl);
  if (result.created) {
    console.log(`Registered Strava webhook subscription (id ${result.id}).`);
  } else {
    console.log(`Strava webhook already registered (id ${result.id}).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

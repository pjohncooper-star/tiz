import { SeasonsList } from "@/app/(app)/plan/seasons/seasons-list";
import { isSimpleSeasonPlannerEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

export default function SeasonsPage() {
  const newSeasonHref = isSimpleSeasonPlannerEnabled() ? "/plan" : "/plan/setup";
  return <SeasonsList newSeasonHref={newSeasonHref} />;
}

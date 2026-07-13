import { SeasonsList } from "@/app/(app)/plan/seasons/seasons-list";

export const dynamic = "force-dynamic";

export default function SeasonsPage() {
  return <SeasonsList newSeasonHref="/plan" />;
}

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PlanSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ seasonId?: string }>;
}) {
  const { seasonId } = await searchParams;
  redirect(seasonId ? `/plan?seasonId=${encodeURIComponent(seasonId)}` : "/plan");
}

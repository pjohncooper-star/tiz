import { redirect } from "next/navigation";
import { workoutHref } from "@/lib/plan/workout-href";

export const dynamic = "force-dynamic";

export default async function PlannedSessionRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  redirect(workoutHref(id, returnTo ? { returnTo } : undefined));
}

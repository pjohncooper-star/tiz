import { redirect } from "next/navigation";
import { trainingPlanHref } from "@/lib/plan/library-href";

export const dynamic = "force-dynamic";

export default async function LegacyTrainingPlanEditorRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(trainingPlanHref(id));
}

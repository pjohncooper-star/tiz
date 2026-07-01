import { redirect } from "next/navigation";
import { libraryTemplateHref } from "@/lib/plan/library-href";

export const dynamic = "force-dynamic";

export default async function LegacyEditWorkoutRedirectPage({
  params,
}: {
  params: Promise<{ folderId: string; templateId: string }>;
}) {
  const { folderId, templateId } = await params;
  redirect(libraryTemplateHref(folderId, templateId));
}

import { redirect } from "next/navigation";
import { libraryNewTemplateHref } from "@/lib/plan/library-href";

export const dynamic = "force-dynamic";

export default async function LegacyNewLibraryWorkoutRedirectPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  redirect(libraryNewTemplateHref(folderId));
}

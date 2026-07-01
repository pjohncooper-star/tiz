import { redirect } from "next/navigation";
import { libraryHref } from "@/lib/plan/library-href";

export const dynamic = "force-dynamic";

export default async function LegacyWorkoutLibraryRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder } = await searchParams;
  redirect(libraryHref(folder ? { folderId: folder } : undefined));
}

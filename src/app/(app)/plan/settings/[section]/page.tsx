import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ section: string }>;
};

export default async function SeasonSettingsPage({ params }: PageProps) {
  const { section } = await params;
  if (!section) {
    notFound();
  }
  redirect("/plan");
}

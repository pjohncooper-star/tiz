import Link from "next/link";
import { ThresholdHistoryEditor } from "@/components/thresholds/threshold-history-editor";
import { loadThresholdHistoryEditorDataForSession } from "@/lib/thresholds/load-editor-data.server";

export const dynamic = "force-dynamic";

export default async function ThresholdHistorySettingsPage() {
  const initialData = await loadThresholdHistoryEditorDataForSession();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link href="/settings" className="text-sm text-sky-600 hover:underline">
        ← Back to settings
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Threshold & primary metric history</h1>
      </div>
      <ThresholdHistoryEditor initialData={initialData} />
    </main>
  );
}

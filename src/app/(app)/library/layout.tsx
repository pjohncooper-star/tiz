import { LibraryTabs } from "@/components/library-tabs";
import type { ReactNode } from "react";

export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Workouts and Programs</h1>
      <LibraryTabs />
      {children}
    </main>
  );
}

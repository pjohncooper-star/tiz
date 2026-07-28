import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppSidebar />
      <AppShell>{children}</AppShell>
    </div>
  );
}

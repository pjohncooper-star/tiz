import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { TimezoneCookieSync } from "@/components/timezone-cookie-sync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <TimezoneCookieSync />
      <AppSidebar />
      <AppShell>{children}</AppShell>
    </div>
  );
}

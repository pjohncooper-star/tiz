import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { CalendarBuildModeProvider } from "@/components/calendar/calendar-build-mode";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CalendarBuildModeProvider>
      <div className="min-h-screen">
        <AppSidebar />
        <AppShell>{children}</AppShell>
      </div>
    </CalendarBuildModeProvider>
  );
}

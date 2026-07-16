import Link from "next/link";
import { AppSidebarClient } from "@/components/app-sidebar-client";
import type { SidebarNavItem } from "@/components/app-sidebar-nav";
import { auth, signOut } from "@/lib/auth";
import { isPlanBuilderEnabled, isPlanningCalendarEnabled } from "@/lib/features";

function SignOutFooter() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
      className="p-3"
    >
      <button
        type="submit"
        className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        Sign out
      </button>
    </form>
  );
}

export async function AppSidebar() {
  const session = await auth();
  const planBuilderEnabled = isPlanBuilderEnabled();
  const calendarEnabled = isPlanningCalendarEnabled();

  const items: SidebarNavItem[] = [{ href: "/dashboard", label: "Dashboard" }];
  if (calendarEnabled) {
    items.push({ href: "/calendar", label: "Calendar" });
  }
  if (planBuilderEnabled) {
    items.push({ href: "/plan", label: "Plan" });
  }
  items.push({ href: "/onboarding/day-flags", label: "Workout Signaling" });
  items.push({ href: "/settings", label: "Settings" });

  return (
    <AppSidebarClient items={items} footer={session?.user ? <SignOutFooter /> : undefined} />
  );
}

import Link from "next/link";
import { AppSidebarNav, type SidebarNavItem } from "@/components/app-sidebar-nav";
import { auth, signOut } from "@/lib/auth";
import { isPlanBuilderEnabled, isPlanningCalendarEnabled } from "@/lib/features";

export async function AppSidebar() {
  const session = await auth();
  const planBuilderEnabled = isPlanBuilderEnabled();
  const calendarEnabled = isPlanningCalendarEnabled();

  const items: SidebarNavItem[] = [
    { href: "/dashboard", label: "Dashboard" },
  ];
  if (calendarEnabled) {
    items.push({ href: "/calendar", label: "Calendar" });
  }
  if (planBuilderEnabled) {
    items.push({ href: "/plan", label: "Plan" });
  }
  items.push({ href: "/onboarding/day-flags", label: "Day flags" });
  items.push({ href: "/settings", label: "Settings" });

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-48 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
        <Link href="/dashboard" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          TiZ
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <AppSidebarNav items={items} />
      </div>

      {session?.user ? (
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  );
}

import Link from "next/link";
import { SETTINGS_CATEGORIES } from "@/lib/settings/categories";

export default function SettingsPage() {
  return (
    <div className="space-y-3">
      {SETTINGS_CATEGORIES.map((category) => (
        <Link
          key={category.href}
          href={category.href}
          className="block rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-sky-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-800"
        >
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {category.label}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {category.description}
          </p>
          <p className="mt-2 text-xs text-zinc-500">{category.contents.join(" · ")}</p>
        </Link>
      ))}
    </div>
  );
}

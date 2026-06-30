export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mx-auto max-w-3xl text-sm font-medium text-zinc-500">TiZ onboarding</p>
      </div>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

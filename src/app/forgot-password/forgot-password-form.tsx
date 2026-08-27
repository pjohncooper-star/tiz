"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@/components/ui";

export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Failed");
        return;
      }
      setSent(true);
      if (typeof d.devResetUrl === "string") setDevResetUrl(d.devResetUrl);
    } catch {
      setError("Could not reach the server. Check that npm run dev is running.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">Reset your password</h1>
        {sent ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              If an account exists for that email, we sent a link to choose a new
              password. It expires in one hour.
            </p>
            {devResetUrl && (
              <p className="mt-3 text-sm">
                <span className="text-zinc-500">Local development: </span>
                <Link href={devResetUrl} className="text-sky-600">
                  continue to reset
                </Link>
              </p>
            )}
            <p className="mt-4 text-center text-sm">
              <Link href="/login" className="text-sky-600">
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
              Enter the email on your account and we will send a reset link.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
            <p className="mt-3 text-center text-sm">
              <Link href="/login" className="text-sky-600">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </Card>
    </main>
  );
}

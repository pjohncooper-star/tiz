"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@/components/ui";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Failed");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Check that npm run dev is running.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">Choose a new password</h1>
        {!token ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              This reset link is missing or incomplete.
            </p>
            <p className="mt-4 text-center text-sm">
              <Link href="/forgot-password" className="text-sky-600">
                Request a new link
              </Link>
            </p>
          </>
        ) : done ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Your password has been updated. You can sign in with it now.
            </p>
            <p className="mt-4 text-center text-sm">
              <Link href="/login" className="text-sky-600">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>New password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="text-sky-600">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </Card>
    </main>
  );
}

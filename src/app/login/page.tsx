"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setError(res.error === "CredentialsSignin" ? "Invalid email or password" : "Sign in failed");
      return;
    }
    else window.location.href = "/";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">Sign in to TiZ</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">Sign in</Button>
        </form>
        <p className="mt-3 text-center text-sm">
          <Link href="/register" className="text-sky-600">Create account</Link>
        </p>
      </Card>
    </main>
  );
}

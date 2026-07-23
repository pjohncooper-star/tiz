"use client";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";

export default function ProfileStep() {
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "profile", name: fd.get("name") }),
    });
    router.push("/onboarding/thresholds");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Step 1 — Profile</h1>
        <p className="text-sm text-zinc-500">
          Tell us your name, then set current and historical thresholds before importing.
        </p>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Your name</Label>
            <Input name="name" required />
          </div>
          <Button type="submit">Continue to thresholds</Button>
        </form>
      </Card>
    </div>
  );
}

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { initializeAthleteDefaults } from "@/lib/onboarding";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    if (await db.user.findUnique({ where: { email: body.email } })) {
      return NextResponse.json({ error: "Email taken" }, { status: 400 });
    }
    const user = await db.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 12),
        athlete: { create: { onboardingStep: "PROFILE" } },
      },
      include: { athlete: true },
    });
    if (user.athlete) await initializeAthleteDefaults(user.athlete.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

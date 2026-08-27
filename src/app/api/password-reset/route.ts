import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppUrl } from "@/lib/app-url";
import { requestPasswordReset } from "@/lib/auth/password-reset.server";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const result = await requestPasswordReset(body.email, getAppUrl(req));
    return NextResponse.json({
      ok: true,
      ...(result.devResetUrl ? { devResetUrl: result.devResetUrl } : {}),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PLANNED_SESSIONS_CSV_TEMPLATE } from "@/lib/plan/csv-import";

export async function GET() {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return new NextResponse(PLANNED_SESSIONS_CSV_TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="planned-sessions-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}

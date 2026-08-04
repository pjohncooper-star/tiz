import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  CalendarShiftError,
  executeCalendarWeekShift,
  previewCalendarWeekShift,
} from "@/lib/plan/calendar/shift-week.server";

const DATE_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bodySchema = z.object({
  weekStart: DATE_KEY,
  targetDate: DATE_KEY,
  discipline: z.enum(["BIKE", "RUN", "SWIM", "STRENGTH"]).optional().nullable(),
  confirm: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "weekStart and targetDate (yyyy-MM-dd) required" },
      { status: 400 }
    );
  }

  const { weekStart, targetDate, discipline, confirm } = parsed.data;

  try {
    if (!confirm) {
      const preview = await previewCalendarWeekShift({
        athleteId,
        weekStart,
        targetDate,
        discipline: discipline ?? null,
      });
      return NextResponse.json({ ok: true, preview });
    }

    const result = await executeCalendarWeekShift({
      athleteId,
      weekStart,
      targetDate,
      discipline: discipline ?? null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof CalendarShiftError) {
      return NextResponse.json(
        {
          error: e.message,
          code: e.code,
          preview: e.preview,
        },
        { status: e.status }
      );
    }
    throw e;
  }
}

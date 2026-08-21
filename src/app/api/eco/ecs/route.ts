import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calendarDateFromDb, formatDateKey, parseDateKey } from "@/lib/dates";
import { isEcoLoadEnabledForAthlete } from "@/lib/eco/preference";
import { isValidEcs, normalizeEcs } from "@/lib/eco/ecs";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const upsertSchema = z.object({
  date: z.string().regex(DATE_KEY),
  ecs: z.number(),
  note: z.string().max(2000).nullable().optional(),
});

function serializeRow(row: { date: Date; ecs: number; note: string | null }) {
  return {
    date: formatDateKey(calendarDateFromDb(row.date)),
    ecs: row.ecs,
    note: row.note,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ecoEnabled = await isEcoLoadEnabledForAthlete(athleteId);
  if (!ecoEnabled) {
    return NextResponse.json({ enabled: false, checkIns: [] });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !DATE_KEY.test(from) || !DATE_KEY.test(to)) {
    return NextResponse.json(
      { error: "from and to (yyyy-MM-dd) required" },
      { status: 400 }
    );
  }
  if (to < from) {
    return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
  }

  const rows = await db.dailyEcsCheckIn.findMany({
    where: {
      athleteId,
      date: { gte: parseDateKey(from), lte: parseDateKey(to) },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json({
    enabled: true,
    checkIns: rows.map(serializeRow),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ecoEnabled = await isEcoLoadEnabledForAthlete(athleteId);
  if (!ecoEnabled) {
    return NextResponse.json(
      { error: "ECO load is disabled; enable it to log ECS" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ecs = normalizeEcs(parsed.data.ecs);
  if (ecs == null || !isValidEcs(ecs)) {
    return NextResponse.json(
      { error: "ecs must be 0–5 in 0.5 steps" },
      { status: 400 }
    );
  }

  const date = parseDateKey(parsed.data.date);
  const note =
    parsed.data.note === undefined
      ? undefined
      : parsed.data.note == null || parsed.data.note.trim() === ""
        ? null
        : parsed.data.note.trim();

  const row = await db.dailyEcsCheckIn.upsert({
    where: {
      athleteId_date: { athleteId, date },
    },
    create: {
      athleteId,
      date,
      ecs,
      ...(note !== undefined ? { note } : {}),
    },
    update: {
      ecs,
      ...(note !== undefined ? { note } : {}),
    },
  });

  return NextResponse.json({ checkIn: serializeRow(row) });
}

export async function DELETE(req: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date || !DATE_KEY.test(date)) {
    return NextResponse.json({ error: "date (yyyy-MM-dd) required" }, { status: 400 });
  }

  await db.dailyEcsCheckIn.deleteMany({
    where: { athleteId, date: parseDateKey(date) },
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  baselineFromFormData,
  importPlannedSessionsCsv,
  PlannedSessionsCsvImportError,
} from "@/lib/plan/csv-import.server";

export async function POST(request: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file selected" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv")) {
    return NextResponse.json({ error: "File must be a .csv" }, { status: 400 });
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return NextResponse.json({ error: "Could not read file" }, { status: 400 });
  }

  try {
    const result = await importPlannedSessionsCsv(
      athleteId,
      text,
      baselineFromFormData(form)
    );
    return NextResponse.json({
      created: result.created,
      structured: result.structured,
      sessions: result.sessions.map((s) => ({
        scheduledDate: s.scheduledDateKey,
        discipline: s.discipline,
        title: s.title,
        estimatedDurationMinutes: s.estimatedDurationMinutes,
        distanceMeters: s.distanceMeters,
        sessionRole: s.sessionRole,
        hasStructuredWorkout: Boolean(s.workoutTree),
      })),
    });
  } catch (e) {
    if (e instanceof PlannedSessionsCsvImportError) {
      return NextResponse.json(
        { error: e.message, errors: e.errors },
        { status: e.status }
      );
    }
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

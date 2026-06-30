import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  importSingleUploadFile,
  SingleImportError,
} from "@/lib/import/import-single.server";
import { isSupportedSingleUpload } from "@/lib/import/parse-single";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const scheduledDate = form.get("scheduledDate");

  if (!file) {
    return NextResponse.json({ error: "No file selected" }, { status: 400 });
  }

  if (!isSupportedSingleUpload(file.name)) {
    return NextResponse.json(
      {
        error: "Unsupported file type. Use .fit, .gpx, or .tcx (including .gz variants).",
      },
      { status: 400 }
    );
  }

  const scheduledDateKey =
    typeof scheduledDate === "string" && DATE_KEY.test(scheduledDate)
      ? scheduledDate
      : undefined;

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = await importSingleUploadFile(
      athleteId,
      file.name,
      buffer,
      scheduledDateKey
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SingleImportError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

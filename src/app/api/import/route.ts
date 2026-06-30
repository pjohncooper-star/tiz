import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import {
  finalizeImportJob,
  prepareImportFromUpload,
  resumeZoneBackfill,
  scheduleImportBatch,
  shouldProcessImportsLocally,
} from "@/lib/import/process-batch";
import { cleanupImport, saveUploadZip } from "@/lib/import/storage";
import { setOnboardingStepIfAtOrBefore } from "@/lib/onboarding";
import type { ImportSource } from "@prisma/client";

export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const source = (form.get("source") as ImportSource) ?? "GARMIN_EXPORT";

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json(
      {
        error:
          "Upload a .zip file. Compress your export folder first (right-click → Send to → Compressed folder on Windows).",
      },
      { status: 400 }
    );
  }

  let jobId: string | null = null;

  try {
    const buffer = new Uint8Array(await file.arrayBuffer());

    const job = await db.importJob.create({
      data: {
        athleteId: session.user.athleteId,
        source,
        status: "PENDING",
        totalFiles: 0,
      },
    });
    jobId = job.id;

    await saveUploadZip(job.id, buffer);
    prepareImportFromUpload(job.id);

    await setOnboardingStepIfAtOrBefore(session.user.athleteId, "IMPORT", "IMPORT");

    return NextResponse.json({
      jobId: job.id,
      scanning: true,
    });
  } catch (e) {
    if (jobId) {
      await db.importJob
        .update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            errorLog: [e instanceof Error ? e.message : "Import failed"],
          },
        })
        .catch(() => {});
      await cleanupImport(jobId).catch(() => {});
    }

    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jobs = await db.importJob.findMany({
    where: { athleteId: session.user.athleteId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return NextResponse.json({ jobs });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await db.importJob.findMany({
    where: { athleteId: session.user.athleteId },
    select: { id: true },
  });

  for (const job of jobs) {
    await cleanupImport(job.id).catch(() => {});
  }

  const result = await db.importJob.deleteMany({
    where: { athleteId: session.user.athleteId },
  });

  return NextResponse.json({ cleared: result.count });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const jobId = body.jobId as string | undefined;
  const finish = body.finish === true;
  const backfillZones = body.backfillZones === true;

  if (backfillZones) {
    const pendingZones = await resumeZoneBackfill(session.user.athleteId);
    return NextResponse.json({ ok: true, pendingZones });
  }

  const job = jobId
    ? await db.importJob.findFirst({
        where: { id: jobId, athleteId: session.user.athleteId },
      })
    : await db.importJob.findFirst({
        where: {
          athleteId: session.user.athleteId,
          status: finish ? "PROCESSING" : "PENDING",
        },
        orderBy: { createdAt: "desc" },
      });

  if (!job) {
    return NextResponse.json({ error: "No import job to process" }, { status: 404 });
  }

  if (finish) {
    await finalizeImportJob(
      job.id,
      session.user.athleteId,
      job.processedFiles,
      job.failedFiles,
      []
    );
    const pendingZones = await resumeZoneBackfill(session.user.athleteId);
    return NextResponse.json({
      ok: true,
      finished: true,
      jobId: job.id,
      pendingZones,
    });
  }

  if (job.status === "PROCESSING") {
    return NextResponse.json({ error: "Import already running" }, { status: 409 });
  }

  if (job.status === "PENDING" && job.totalFiles === 0) {
    prepareImportFromUpload(job.id);
    return NextResponse.json({ ok: true, processing: "scanning", jobId: job.id });
  }

  if (shouldProcessImportsLocally()) {
    scheduleImportBatch(job.id);
    return NextResponse.json({ ok: true, processing: "local", jobId: job.id });
  }

  await inngest.send({
    name: "import/batch.process",
    data: { jobId: job.id },
  });
  return NextResponse.json({ ok: true, processing: "inngest", jobId: job.id });
}

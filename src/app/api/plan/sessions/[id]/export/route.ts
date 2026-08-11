import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseWorkoutTree } from "@/lib/workout/steps";
import { workoutTreeToZwo } from "@/lib/workout/export-zwo";
import { workoutTreeToFit } from "@/lib/workout/export-fit-workout";
import { loadFitExportThresholds } from "@/lib/workout/fit-export-profile.server";
import {
  formatMissingRelativeIntensity,
  missingRelativeIntensity,
} from "@/lib/workout/relative-intensity";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  const athleteId = session?.user?.athleteId;
  if (!athleteId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get("format") ?? "zwo";

  const planned = await db.plannedSession.findFirst({
    where: { id, athleteId },
    include: { structuredWorkout: true },
  });
  if (!planned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawSteps = planned.structuredWorkout?.steps;
  const tree = rawSteps ? parseWorkoutTree(rawSteps) : null;

  if (format === "zwo") {
    if (!tree || tree.nodes.length === 0) {
      return NextResponse.json({ error: "No structured workout to export" }, { status: 400 });
    }
    const body = workoutTreeToZwo(planned.title, tree);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="${slugify(planned.title)}.zwo"`,
      },
    });
  }

  if (format === "fit") {
    if (!tree || tree.nodes.length === 0) {
      return NextResponse.json({ error: "No structured workout to export" }, { status: 400 });
    }
    const thresholds = await loadFitExportThresholds(
      athleteId,
      planned.discipline,
      planned.scheduledDate
    );
    const missing = missingRelativeIntensity(tree.nodes, {
      thresholdPaceSeconds: thresholds.thresholdPaceSecondsPerKm ?? null,
      racePaces: thresholds.racePaces ?? null,
      ftpWatts: thresholds.ftpWatts ?? null,
      maxHeartRateBpm: thresholds.maxHeartRateBpm ?? null,
    });
    const missingLines = formatMissingRelativeIntensity(missing);
    if (missingLines.length > 0) {
      return NextResponse.json(
        {
          error: `Set missing intensity anchors before FIT export: ${missingLines.join("; ")}`,
          missingAnchors: missingLines,
        },
        { status: 400 }
      );
    }
    const bytes = workoutTreeToFit(planned.title, planned.discipline, tree, thresholds);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${slugify(planned.title)}.fit"`,
      },
    });
  }

  return NextResponse.json({ error: "format must be zwo or fit" }, { status: 400 });
}

function slugify(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "workout";
}

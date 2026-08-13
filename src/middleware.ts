import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import {
  isPlanBuilderEnabled,
  isPlanningCalendarEnabled,
  isSessionPlanningEnabled,
} from "@/lib/features";

const { auth } = NextAuth(authConfig);

function isCalendarPath(pathname: string): boolean {
  return (
    pathname === "/calendar" ||
    pathname.startsWith("/calendar/") ||
    pathname.startsWith("/api/plan/calendar")
  );
}

function isPlanBuilderUiPath(pathname: string): boolean {
  return pathname === "/plan";
}

function isWorkoutDetailPath(pathname: string): boolean {
  return pathname.startsWith("/workouts/");
}

function isSessionApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/plan/sessions");
}

function isTrainingSearchApiPath(pathname: string): boolean {
  return (
    pathname === "/api/plan/search" ||
    pathname.startsWith("/api/plan/search/") ||
    pathname === "/api/plan/tags" ||
    pathname.startsWith("/api/plan/tags/")
  );
}

function isWorkoutLibraryPath(pathname: string): boolean {
  return (
    pathname === "/library" ||
    pathname.startsWith("/library/") ||
    pathname === "/plan/library" ||
    pathname.startsWith("/plan/library/") ||
    pathname === "/plan/workouts" ||
    pathname.startsWith("/plan/workouts/") ||
    pathname.startsWith("/api/plan/workout-folders") ||
    pathname === "/plan/components" ||
    pathname.startsWith("/plan/components/") ||
    pathname === "/plan/training-plans" ||
    pathname.startsWith("/plan/training-plans/")
  );
}

function isPlanBuilderApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/plan/calendar")) return false;
  if (pathname.startsWith("/api/plan/sessions")) return false;
  if (pathname.startsWith("/api/plan/workout-folders")) return false;
  if (pathname.startsWith("/api/plan/components")) return false;
  if (isTrainingSearchApiPath(pathname)) return false;
  return pathname.startsWith("/api/plan");
}

function blockPage(req: { nextUrl: { clone: () => URL } }) {
  const url = req.nextUrl.clone();
  url.pathname = "/dashboard";
  return NextResponse.redirect(url);
}

function blockApi() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const planBuilder = isPlanBuilderEnabled();
  const calendar = isPlanningCalendarEnabled();
  const sessions = isSessionPlanningEnabled();

  if (!calendar && isCalendarPath(pathname)) {
    return pathname.startsWith("/api/") ? blockApi() : blockPage(req);
  }

  if (!planBuilder && isPlanBuilderUiPath(pathname)) {
    return blockPage(req);
  }

  if (!sessions && isWorkoutDetailPath(pathname)) {
    return blockPage(req);
  }

  if (!sessions && isSessionApiPath(pathname)) {
    return blockApi();
  }

  // Search/tags are used from the planning calendar and session details.
  if (!sessions && !calendar && isTrainingSearchApiPath(pathname)) {
    return blockApi();
  }

  if (!sessions && isWorkoutLibraryPath(pathname)) {
    return pathname.startsWith("/api/") ? blockApi() : blockPage(req);
  }

  if (!planBuilder && isPlanBuilderApiPath(pathname)) {
    return blockApi();
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|api/import).*)"],
};

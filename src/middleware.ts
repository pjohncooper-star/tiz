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

function isSessionEditorPath(pathname: string): boolean {
  return pathname.startsWith("/plan/sessions/");
}

function isSessionApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/plan/sessions");
}

function isWorkoutLibraryPath(pathname: string): boolean {
  return (
    pathname === "/plan/workouts" ||
    pathname.startsWith("/plan/workouts/") ||
    pathname.startsWith("/api/plan/workout-folders") ||
    pathname === "/plan/components" ||
    pathname.startsWith("/plan/components/")
  );
}

function isPlanBuilderApiPath(pathname: string): boolean {
  if (pathname.startsWith("/api/plan/calendar")) return false;
  if (pathname.startsWith("/api/plan/sessions")) return false;
  if (pathname.startsWith("/api/plan/workout-folders")) return false;
  if (pathname.startsWith("/api/plan/components")) return false;
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

  if (!sessions && isSessionEditorPath(pathname)) {
    return blockPage(req);
  }

  if (!sessions && isSessionApiPath(pathname)) {
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

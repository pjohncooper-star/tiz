import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  providers: [],
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const publicPaths = [
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/api/auth",
        "/api/register",
        "/api/password-reset",
        "/api/webhooks/strava",
        "/api/strava/callback",
        "/api/inngest",
        // Token-authenticated calendar subscription (validated in the route).
        "/api/plan/calendar/feed.ics",
      ];
      if (publicPaths.some((p) => pathname.startsWith(p))) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;

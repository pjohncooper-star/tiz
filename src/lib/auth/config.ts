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
        "/api/auth",
        "/api/register",
        "/api/webhooks/strava",
        "/api/strava/callback",
        "/api/inngest",
      ];
      if (publicPaths.some((p) => pathname.startsWith(p))) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;

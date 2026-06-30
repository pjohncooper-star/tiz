import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { OnboardingStep, UserRole } from "@prisma/client";
import { authConfig } from "./config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: UserRole;
      athleteId?: string;
      onboardingStep?: OnboardingStep;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
          include: { athlete: true },
        });
        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          athleteId: user.athlete?.id,
          onboardingStep: user.athlete?.onboardingStep,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          role?: UserRole;
          athleteId?: string;
          onboardingStep?: OnboardingStep;
        };
        token.role = u.role;
        token.athleteId = u.athleteId;
        token.onboardingStep = u.onboardingStep;
      } else if (token.sub) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub },
          include: { athlete: true },
        });
        if (dbUser?.athlete) {
          token.athleteId = dbUser.athlete.id;
          token.onboardingStep = dbUser.athlete.onboardingStep;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as UserRole;
        session.user.athleteId = token.athleteId as string | undefined;
        session.user.onboardingStep = token.onboardingStep as OnboardingStep | undefined;
      }
      return session;
    },
  },
});

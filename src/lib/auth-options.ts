import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          // Drive upload + read access for the coach's owned files (source of truth).
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Ensure there is a Coach row for the signed-in user.
      if (account?.provider === "google" && user.id && user.email) {
        await prisma.coach.upsert({
          where: { userId: user.id },
          update: {
            name: user.name || "Coach",
            email: user.email,
            authProviderId: account.providerAccountId,
          },
          create: {
            userId: user.id,
            name: user.name || "Coach",
            email: user.email,
            authProviderId: account.providerAccountId,
          },
        });
      }
      return true;
    },
    async jwt({ token, account, user }) {
      // Persist Google OAuth tokens in the JWT for the client upload flow.
      if (account?.provider === "google") {
        (token as any).accessToken = account.access_token;
        (token as any).refreshToken = account.refresh_token;
      }
      if (user?.id) {
        (token as any).userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose access token for client-side Drive uploads.
      (session as any).accessToken = (token as any).accessToken;
      (session as any).refreshToken = (token as any).refreshToken;
      (session as any).userId = (token as any).userId;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

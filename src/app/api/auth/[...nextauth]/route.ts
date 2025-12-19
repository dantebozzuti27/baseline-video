import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { Account, NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }): Promise<JWT> {
      if (account) {
        const acc = account as Account & {
          access_token?: string;
          refresh_token?: string;
        };
        const t = token as JWT & { accessToken?: string; refreshToken?: string };
        t.accessToken = acc.access_token;
        t.refreshToken = acc.refresh_token;
        return t;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as JWT & { accessToken?: string; refreshToken?: string };
      return {
        ...session,
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
      };
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };


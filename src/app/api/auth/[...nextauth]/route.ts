import type { Account, NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import NextAuth from "next-auth/next";
import GoogleProvider from "next-auth/providers/google";

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
        token = token as JWT & { accessToken?: string; refreshToken?: string };
        token.accessToken = acc.access_token;
        token.refreshToken = acc.refresh_token;
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
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };


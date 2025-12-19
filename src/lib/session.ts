import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

type SessionLike = {
  user?: { email?: string | null };
  accessToken?: string;
  refreshToken?: string;
} | null;

export async function getSession(req: NextRequest): Promise<SessionLike> {
  const token = await getToken({ req });
  if (!token) return null;
  const t = token as {
    email?: string | null;
    accessToken?: string;
    refreshToken?: string;
  };
  return {
    user: { email: t.email },
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
  };
}


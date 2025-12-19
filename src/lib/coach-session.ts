import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { prisma } from "@/lib/prisma";

export async function getCoachFromRequest(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const userId = (token as any)?.userId as string | undefined;
  if (!userId) return null;

  return prisma.coach.findUnique({ where: { userId } });
}

export async function requireCoach(req: NextRequest) {
  const coach = await getCoachFromRequest(req);
  if (!coach) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return coach;
}



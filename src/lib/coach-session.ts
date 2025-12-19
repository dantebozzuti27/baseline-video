import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getCoachFromRequest(req: NextRequest) {
  // req is kept for API compatibility, but Supabase auth is cookie-based.
  void req;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const authUserId = user.id;
  return prisma.coach.findUnique({ where: { authUserId } });
}

export async function requireCoach(req: NextRequest) {
  const coach = await getCoachFromRequest(req);
  if (!coach) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return coach;
}



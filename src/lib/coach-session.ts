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
  const email = user.email ?? null;
  const name =
    (user.user_metadata as any)?.full_name ||
    (user.user_metadata as any)?.name ||
    (email ? email.split("@")[0] : "Coach");

  const existing = await prisma.coach.findUnique({ where: { authUserId } });
  if (existing) return existing;

  // Create a coach record on first successful sign-in.
  return prisma.coach.create({
    data: {
      authUserId,
      name,
      email: email || `${authUserId}@example.invalid`,
    },
  });
}

export async function requireCoach(req: NextRequest) {
  const coach = await getCoachFromRequest(req);
  if (!coach) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return coach;
}



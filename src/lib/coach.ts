import { prisma } from "@/lib/prisma";

export async function ensureCoachForAuthUser(params: {
  authUserId: string;
  email: string | null;
  name: string;
}) {
  const { authUserId, email, name } = params;

  const coach = await prisma.coach.upsert({
    where: { authUserId },
    update: {
      name,
      ...(email ? { email } : {}),
    },
    create: {
      authUserId,
      name,
      // If Supabase user has no email (rare), write a stable placeholder.
      email: email || `${authUserId}@example.invalid`,
    },
  });

  return coach;
}



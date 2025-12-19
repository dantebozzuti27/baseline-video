import { prisma } from "@/lib/prisma";

export async function ensureCoachForAuthUser(params: {
  authUserId: string;
  email: string | null;
  name: string;
}) {
  const { authUserId, email, name } = params;

  const existing = await prisma.coach.findUnique({ where: { authUserId } });
  if (existing) {
    // Keep profile info fresh.
    return prisma.coach.update({
      where: { id: existing.id },
      data: { name, ...(email ? { email } : {}) },
    });
  }

  // IMPORTANT security note:
  // Without a role system, any logged-in user could become a coach by visiting /coach.
  // In production, set COACH_EMAIL_ALLOWLIST="you@domain.com,other@domain.com".
  const allowlistRaw = process.env.COACH_EMAIL_ALLOWLIST || "";
  const allowlist = allowlistRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const normalizedEmail = (email || "").toLowerCase();
  const hasCoach = await prisma.coach.count().then((n) => n > 0);
  const allowed =
    allowlist.length > 0
      ? Boolean(normalizedEmail && allowlist.includes(normalizedEmail))
      : !hasCoach; // if no allowlist, only the first coach can be created.

  if (!allowed) {
    throw new Error(
      "Not authorized as coach. Ask an admin to add your email to COACH_EMAIL_ALLOWLIST.",
    );
  }

  const coach = await prisma.coach.create({
    data: {
      authUserId,
      name,
      email: email || `${authUserId}@example.invalid`,
    },
  });

  return coach;
}



import { NextRequest } from "next/server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { coachCreateSchema } from "@/lib/validation";

export async function GET() {
  const coaches = await prisma.coach.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ coaches });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = await req.json();
  const parsed = coachCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // find-or-create coach by email to avoid duplicates
  const coach = await prisma.coach.upsert({
    where: { email: session.user.email },
    update: {
      name: parsed.data.name,
      authProviderId: parsed.data.authProviderId,
    },
    create: {
      name: parsed.data.name,
      email: session.user.email,
      authProviderId: parsed.data.authProviderId,
    },
  });

  return Response.json({ coach }, { status: 201 });
}


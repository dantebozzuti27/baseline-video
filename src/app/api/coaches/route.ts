import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { coachCreateSchema } from "@/lib/validation";

export async function GET() {
  const coaches = await prisma.coach.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ coaches });
}

export async function POST(req: NextRequest) {
  // Allow only authenticated callers (admin can gate token issuance separately)
  await requireAuth(req);
  const json = await req.json();
  const parsed = coachCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const coach = await prisma.coach.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      authProviderId: parsed.data.authProviderId,
    },
  });

  return Response.json({ coach }, { status: 201 });
}


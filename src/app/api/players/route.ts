import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/coach-session";
import { playerCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const coach = await requireCoach(req);

  const players = await prisma.player.findMany({
    where: { coachId: coach.id },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ players });
}

export async function POST(req: NextRequest) {
  const coach = await requireCoach(req);
  const json = await req.json();

  const parsed = playerCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const player = await prisma.player.create({
    data: {
      coachId: coach.id,
      name: parsed.data.name,
      email: parsed.data.email || null,
    },
  });

  return Response.json({ player }, { status: 201 });
}

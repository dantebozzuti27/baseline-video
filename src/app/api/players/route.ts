import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { playerCreateSchema } from "@/lib/validation";
import { getSession } from "@/lib/session";

async function getCoachIdFromSession(req: NextRequest) {
  const session = await getSession(req);
  if (!session?.user?.email) return null;
  const coach = await prisma.coach.findUnique({
    where: { email: session.user.email },
  });
  return coach?.id ?? null;
}

export async function GET(req: NextRequest) {
  const coachId = await getCoachIdFromSession(req);
  if (!coachId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get("playerId");

  const where =
    playerId != null
      ? { id: playerId, coachId }
      : { coachId };

  const players = await prisma.player.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ players });
}

export async function POST(req: NextRequest) {
  const coachId = await getCoachIdFromSession(req);
  if (!coachId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = await req.json();
  const parsed = playerCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const player = await prisma.player.create({
    data: {
      coachId,
      name: parsed.data.name,
      email: parsed.data.email ?? undefined,
      status: parsed.data.status,
    },
  });

  return Response.json({ player }, { status: 201 });
}


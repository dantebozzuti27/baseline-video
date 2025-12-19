import { NextRequest } from "next/server";

import { requireAuth, requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { playerCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  const { searchParams } = new URL(req.url);
  const coachId = searchParams.get("coachId");
  const playerId = searchParams.get("playerId");

  // Authorization: coaches can view their players; players can view self
  if (auth.role === "coach") {
    if (coachId && coachId !== auth.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (auth.role === "player") {
    if (playerId && playerId !== auth.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!playerId) {
      return Response.json({ error: "playerId required for player role" }, { status: 400 });
    }
  }

  const where =
    playerId != null
      ? { id: playerId }
      : coachId != null
        ? { coachId }
        : {};

  const players = await prisma.player.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ players });
}

export async function POST(req: NextRequest) {
  const coachAuth = await requireCoach(req);
  const json = await req.json();
  const parsed = playerCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.coachId !== coachAuth.id) {
    return Response.json({ error: "Forbidden: coach mismatch" }, { status: 403 });
  }

  const player = await prisma.player.create({
    data: {
      coachId: parsed.data.coachId,
      name: parsed.data.name,
      email: parsed.data.email ?? undefined,
      status: parsed.data.status,
    },
  });

  return Response.json({ player }, { status: 201 });
}


import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { lessonCreateSchema } from "@/lib/validation";
import { getSession } from "@/lib/session";

async function getCoachFromSession() {
  const session = await getSession();
  if (!session?.user?.email) return null;
  return prisma.coach.findUnique({
    where: { email: session.user.email },
  });
}

export async function GET(req: NextRequest) {
  const coach = await getCoachFromSession();
  if (!coach) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const playerId = searchParams.get("playerId");

  const where = {
    coachId: coach.id,
    ...(playerId ? { playerId } : {}),
  };

  const lessons = await prisma.lesson.findMany({
    where,
    include: {
      media: true,
    },
    orderBy: { date: "desc" },
  });

  return Response.json({ lessons });
}

export async function POST(req: NextRequest) {
  const coach = await getCoachFromSession();
  if (!coach) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const json = await req.json();
  const parsed = lessonCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // ensure player belongs to this coach
  const player = await prisma.player.findUnique({
    where: { id: parsed.data.playerId, coachId: coach.id },
  });
  if (!player) {
    return Response.json({ error: "Player not found for coach" }, { status: 403 });
  }

  const lesson = await prisma.lesson.create({
    data: {
      coachId: coach.id,
      playerId: parsed.data.playerId,
      date: new Date(parsed.data.date),
      category: parsed.data.category,
      notes: parsed.data.notes ?? undefined,
    },
  });

  return Response.json({ lesson }, { status: 201 });
}


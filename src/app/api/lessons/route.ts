import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/coach-session";
import { lessonCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const coach = await requireCoach(req);
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId") || undefined;

  const lessons = await prisma.lesson.findMany({
    where: {
      coachId: coach.id,
      ...(playerId ? { playerId } : {}),
    },
    include: {
      player: true,
      media: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { date: "desc" },
  });

  return Response.json({ lessons });
}

export async function POST(req: NextRequest) {
  const coach = await requireCoach(req);
  const json = await req.json();
  const parsed = lessonCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify player belongs to coach.
  const player = await prisma.player.findFirst({
    where: { id: parsed.data.playerId, coachId: coach.id },
  });
  if (!player) {
    return Response.json({ error: "Player not found" }, { status: 404 });
  }

  const lesson = await prisma.lesson.create({
    data: {
      coachId: coach.id,
      playerId: player.id,
      date: new Date(parsed.data.date),
      category: parsed.data.category,
      notes: parsed.data.notes || null,
    },
  });

  return Response.json({ lesson }, { status: 201 });
}

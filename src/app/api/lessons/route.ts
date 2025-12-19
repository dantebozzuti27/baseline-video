import { NextRequest } from "next/server";

import { requireAuth, requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lessonCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  const { searchParams } = new URL(req.url);
  const coachId = searchParams.get("coachId");
  const playerId = searchParams.get("playerId");

  // auth checks
  if (auth.role === "coach") {
    if (coachId && coachId !== auth.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (auth.role === "player") {
    if (!playerId) {
      return Response.json({ error: "playerId required for player role" }, { status: 400 });
    }
    if (playerId !== auth.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const where = {
    ...(coachId ? { coachId } : {}),
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
  const coachAuth = await requireCoach(req);
  const json = await req.json();
  const parsed = lessonCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.coachId !== coachAuth.id) {
    return Response.json({ error: "Forbidden: coach mismatch" }, { status: 403 });
  }

  const lesson = await prisma.lesson.create({
    data: {
      coachId: parsed.data.coachId,
      playerId: parsed.data.playerId,
      date: new Date(parsed.data.date),
      category: parsed.data.category,
      notes: parsed.data.notes ?? undefined,
    },
  });

  return Response.json({ lesson }, { status: 201 });
}


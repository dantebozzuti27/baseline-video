import { NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await context.params;
  const auth = await requireAuth(_req);
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      media: true,
      player: true,
      coach: true,
    },
  });

  if (!lesson) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (
    (auth.role === "coach" && lesson.coachId !== auth.id) ||
    (auth.role === "player" && lesson.playerId !== auth.id)
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({ lesson });
}


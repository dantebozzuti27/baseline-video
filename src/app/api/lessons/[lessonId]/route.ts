import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ lessonId: string }> },
) {
  const session = await getSession(req);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const coach = await prisma.coach.findUnique({
    where: { email: session.user.email },
  });
  const { lessonId } = await context.params;
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

  if (!coach || lesson.coachId !== coach.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json({ lesson });
}


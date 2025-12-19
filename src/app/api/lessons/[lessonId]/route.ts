import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/coach-session";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const coach = await requireCoach(req);
  const { lessonId } = await ctx.params;

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, coachId: coach.id },
    include: {
      player: true,
      media: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!lesson) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ lesson });
}

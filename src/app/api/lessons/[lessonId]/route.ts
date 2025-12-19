import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getLessonActorForUser } from "@/lib/lesson-access";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await ctx.params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await getLessonActorForUser({
    userId: user.id,
    email: user.email ?? null,
  });
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const lesson = await prisma.lesson.findFirst({
    where:
      actor.role === "coach"
        ? { id: lessonId, coachId: actor.coachId }
        : { id: lessonId, playerId: actor.playerId },
    include: {
      player: true,
      media: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!lesson) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ lesson });
}

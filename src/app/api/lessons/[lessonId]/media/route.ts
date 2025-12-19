import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { mediaRegisterSchema } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { getLessonActorForUser } from "@/lib/lesson-access";

export async function POST(
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
  });
  if (!lesson) return Response.json({ error: "Not found" }, { status: 404 });

  const json = await req.json();
  const parsed = mediaRegisterSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const media = await prisma.mediaAsset.create({
    data: {
      lessonId,
      type: parsed.data.type,
      googleDriveFileId: parsed.data.googleDriveFileId,
      googleDriveWebViewLink: parsed.data.googleDriveWebViewLink,
      durationSeconds: parsed.data.durationSeconds ?? null,
    },
  });

  await (prisma as any).mirrorJob.create({
    data: {
      mediaAssetId: media.id,
      status: "queued",
    },
  });

  return Response.json({ media }, { status: 201 });
}

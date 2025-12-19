import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCoach } from "@/lib/coach-session";
import { mediaRegisterSchema } from "@/lib/validation";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  const coach = await requireCoach(req);
  const { lessonId } = await ctx.params;

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, coachId: coach.id },
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

  await prisma.mirrorJob.create({
    data: {
      mediaAssetId: media.id,
      status: "queued",
    },
  });

  return Response.json({ media }, { status: 201 });
}

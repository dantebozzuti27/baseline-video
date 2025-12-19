import { NextRequest } from "next/server";

import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mediaCreateSchema } from "@/lib/validation";

type Params = {
  params: { lessonId: string };
};

export async function POST(req: NextRequest, { params }: Params) {
  const coachAuth = await requireCoach(req);
  const json = await req.json();
  const parsed = mediaCreateSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Ensure lesson belongs to coach
  const lesson = await prisma.lesson.findUnique({
    where: { id: params.lessonId },
    select: { coachId: true },
  });
  if (!lesson) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (lesson.coachId !== coachAuth.id) {
    return Response.json({ error: "Forbidden: coach mismatch" }, { status: 403 });
  }

  const media = await prisma.mediaAsset.create({
    data: {
      lessonId: params.lessonId,
      type: parsed.data.type,
      googleDriveFileId: parsed.data.googleDriveFileId,
      googleDriveWebViewLink: parsed.data.googleDriveWebViewLink,
      mirroredObjectStoreUrl: parsed.data.mirroredObjectStoreUrl ?? undefined,
      durationSeconds: parsed.data.durationSeconds,
    },
  });

  return Response.json({ media }, { status: 201 });
}


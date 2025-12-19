import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { mediaCreateSchema } from "@/lib/validation";
import { getSession } from "@/lib/session";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await context.params;
  const session = await getSession();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const coach = await prisma.coach.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!coach) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    where: { id: lessonId },
    select: { coachId: true },
  });
  if (!lesson) {
    return Response.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (lesson.coachId !== coach.id) {
    return Response.json(
      { error: "Forbidden: coach mismatch" },
      { status: 403 },
    );
  }

  const media = await prisma.mediaAsset.create({
    data: {
      lessonId,
      type: parsed.data.type,
      googleDriveFileId: parsed.data.googleDriveFileId,
      googleDriveWebViewLink: parsed.data.googleDriveWebViewLink,
      mirroredObjectStoreUrl: parsed.data.mirroredObjectStoreUrl ?? undefined,
      durationSeconds: parsed.data.durationSeconds,
    },
  });

  return Response.json({ media }, { status: 201 });
}


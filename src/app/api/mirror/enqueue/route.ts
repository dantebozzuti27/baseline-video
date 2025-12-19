import { NextRequest } from "next/server";

import { mirrorJobSchema } from "@/lib/validation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Accepts a mirroring job request. In production this would enqueue a background
 * worker to pull from Google Drive and push to object storage.
 */
export async function POST(req: NextRequest) {
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
  const parsed = mirrorJobSchema.safeParse(json);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Placeholder for enqueue logic
  // await mirrorQueue.enqueue(parsed.data)

  return Response.json({ accepted: true, job: parsed.data }, { status: 202 });
}


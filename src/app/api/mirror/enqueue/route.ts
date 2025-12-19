import { NextRequest } from "next/server";

import { requireCoach } from "@/lib/auth";
import { mirrorJobSchema } from "@/lib/validation";

/**
 * Accepts a mirroring job request. In production this would enqueue a background
 * worker to pull from Google Drive and push to object storage.
 */
export async function POST(req: NextRequest) {
  await requireCoach(req);
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


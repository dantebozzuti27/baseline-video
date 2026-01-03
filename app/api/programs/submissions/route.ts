import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  // Back-compat (week bucket)
  enrollmentId: z.string().min(1).optional(),
  weekIndex: z.number().int().min(1).optional(),
  // New: attach to specific structured assignment (preferred)
  assignmentId: z.string().min(1).optional(),
  videoId: z.string().min(1),
  note: z.string().max(2000).optional()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  let data: any = null;
  let error: any = null;

  if (parsed.data.assignmentId) {
    const resp = await supabase.rpc("submit_program_video_to_assignment", {
      p_assignment_id: parsed.data.assignmentId,
      p_video_id: parsed.data.videoId,
      p_note: parsed.data.note ?? null
    });
    data = resp.data;
    error = resp.error;
  } else {
    if (!parsed.data.enrollmentId || !parsed.data.weekIndex) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const resp = await supabase.rpc("submit_program_video", {
      p_enrollment_id: parsed.data.enrollmentId,
      p_week_index: parsed.data.weekIndex,
      p_video_id: parsed.data.videoId,
      p_note: parsed.data.note ?? null
    });
    data = resp.data;
    error = resp.error;
  }

  if (error) {
    console.error("submit_program_video failed", error);
    return NextResponse.json({ error: "Unable to submit video." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}



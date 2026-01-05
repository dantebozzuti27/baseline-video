import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/utils/events";
import { logErrorServer } from "@/lib/analytics";

const schema = z.object({
  startAt: z.string().min(1),
  minutes: z.number().int().min(15).max(180),
  timezone: z.string().min(1).max(64).optional(),
  note: z.string().max(2000).optional()
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  console.log("Reschedule request:", JSON.stringify(json, null, 2));
  
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error("Reschedule validation failed:", parsed.error.errors);
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const startAt = new Date(parsed.data.startAt);
  if (!Number.isFinite(startAt.getTime())) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });

  const { error } = await supabase.rpc("reschedule_lesson", {
    p_lesson_id: params.id,
    p_start_at: startAt.toISOString(),
    p_minutes: parsed.data.minutes,
    p_timezone: parsed.data.timezone ?? "UTC",
    p_note: parsed.data.note ?? null
  });
  
  console.log("Reschedule RPC result:", error ? JSON.stringify(error) : "success");

  if (error) {
    console.error("reschedule_lesson failed", JSON.stringify(error, null, 2));
    const errMsg = (error as any)?.message || "";
    let msg = "Unable to reschedule lesson.";
    if (errMsg.includes("conflict")) msg = "That coach is already booked at that time.";
    else if (errMsg.includes("blocked")) msg = "That time is blocked off.";
    else if (errMsg.includes("not_found")) msg = "Lesson not found.";
    else if (errMsg.includes("forbidden")) msg = "You don't have permission.";
    else if (errMsg.includes("missing_profile")) msg = "Session expired. Please refresh.";
    
    // Log error to analytics
    const admin = createSupabaseAdminClient();
    await logErrorServer(admin, "api", errMsg || "reschedule_lesson failed", {
      userId: user.id,
      endpoint: "/api/lessons/reschedule",
      metadata: { lessonId: params.id, rpcError: errMsg }
    });
    
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logEvent("lesson_rescheduled", "lesson", params.id, {});
  return NextResponse.json({ ok: true });
}



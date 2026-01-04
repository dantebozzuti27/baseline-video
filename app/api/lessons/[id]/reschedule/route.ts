import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/utils/events";

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
    console.error("reschedule_lesson failed", error);
    const msg = (error as any)?.message?.includes("conflict")
      ? "That coach is already booked at that time."
      : (error as any)?.message?.includes("blocked")
        ? "That time is blocked off."
        : "Unable to reschedule lesson.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await logEvent("lesson_rescheduled", "lesson", params.id, {});
  return NextResponse.json({ ok: true });
}



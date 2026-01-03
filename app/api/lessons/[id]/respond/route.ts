import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/utils/events";

const schema = z.object({
  approve: z.boolean(),
  note: z.string().max(2000).optional()
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Prefer admin-driven update: avoids silent RLS/session mismatches.
  // We still enforce permissions by checking the signed-in user's profile + lesson ownership.
  try {
    const admin = createSupabaseAdminClient();
    const { data: myProfile } = await admin.from("profiles").select("team_id, role").eq("user_id", user.id).maybeSingle();
    if (!myProfile?.team_id || myProfile.role !== "coach") {
      return NextResponse.json({ error: "Unable to update lesson request." }, { status: 400 });
    }

    const { data: lesson } = await admin
      .from("lessons")
      .select("id, team_id, coach_user_id, start_at, end_at")
      .eq("id", params.id)
      .maybeSingle();
    if (!lesson || lesson.team_id !== myProfile.team_id || lesson.coach_user_id !== user.id) {
      return NextResponse.json({ error: "Unable to update lesson request." }, { status: 400 });
    }

    if (parsed.data.approve) {
      const { data: overlaps } = await admin
        .from("lessons")
        .select("id")
        .eq("team_id", myProfile.team_id)
        .eq("coach_user_id", user.id)
        .eq("status", "approved")
        .neq("id", params.id)
        .lt("start_at", lesson.end_at)
        .gt("end_at", lesson.start_at)
        .limit(1);
      if (overlaps && overlaps.length) {
        return NextResponse.json({ error: "Unable to update lesson request." }, { status: 400 });
      }

      const { data: blocks } = await admin
        .from("coach_time_blocks")
        .select("id")
        .eq("team_id", myProfile.team_id)
        .eq("coach_user_id", user.id)
        .lt("start_at", lesson.end_at)
        .gt("end_at", lesson.start_at)
        .limit(1);
      if (blocks && blocks.length) {
        return NextResponse.json({ error: "Unable to update lesson request." }, { status: 400 });
      }
    }

    const { error: updErr } = await admin
      .from("lessons")
      .update({
        status: parsed.data.approve ? "approved" : "declined",
        coach_response_note: parsed.data.note ? String(parsed.data.note).trim() || null : null
      })
      .eq("id", params.id);
    if (updErr) {
      console.error("admin lessons update failed", updErr);
      return NextResponse.json({ error: "Unable to update lesson request." }, { status: 400 });
    }
  } catch (e: any) {
    // Fallback to RPC if admin env isn't configured.
    const { error } = await supabase.rpc("respond_to_lesson_request", {
      p_lesson_id: params.id,
      p_approve: parsed.data.approve,
      p_note: parsed.data.note ?? null
    });

    if (error) {
      console.error("respond_to_lesson_request failed", error);
      return NextResponse.json({ error: "Unable to update lesson request." }, { status: 400 });
    }
  }

  await logEvent(parsed.data.approve ? "lesson_approved" : "lesson_declined", "lesson", params.id, {});
  return NextResponse.json({ ok: true });
}



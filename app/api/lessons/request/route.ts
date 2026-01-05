import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { trackEventServer } from "@/lib/analytics";

const schema = z.object({
  coachUserId: z.string().uuid(),
  mode: z.enum(["in_person", "remote"]),
  startAt: z.string().min(1), // ISO string
  minutes: z.number().int().min(15).max(180),
  timezone: z.string().min(1).max(64).optional(),
  notes: z.string().max(2000).optional(),
  secondPlayerUserId: z.string().uuid().optional()
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

  const startAt = new Date(parsed.data.startAt);
  if (!Number.isFinite(startAt.getTime())) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });

  const { data, error } = await supabase.rpc("request_lesson", {
    p_coach_user_id: parsed.data.coachUserId,
    p_mode: parsed.data.mode,
    p_start_at: startAt.toISOString(),
    p_minutes: parsed.data.minutes,
    p_timezone: parsed.data.timezone ?? "UTC",
    p_notes: parsed.data.notes ?? null,
    p_second_player_user_id: parsed.data.secondPlayerUserId ?? null
  });

  if (error) {
    console.error("request_lesson failed", error);
    const msg =
      (error as any)?.message?.includes("invalid_coach")
        ? "Choose a coach on your team."
        : (error as any)?.message?.includes("invalid_second_player")
          ? "Choose a valid second player."
        : (error as any)?.message?.includes("blocked")
          ? "That time is blocked off by the coach."
          : (error as any)?.message?.includes("conflict")
            ? "That coach is already booked at that time."
        : (error as any)?.message?.includes("invalid_duration")
          ? "Choose a duration between 15 and 180 minutes."
          : "Unable to request lesson.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Track lesson request event
  const { data: profile } = await supabase.from("profiles").select("team_id").eq("user_id", user.id).single();
  const admin = createSupabaseAdminClient();
  await trackEventServer(admin, "lesson_request", {
    userId: user.id,
    teamId: profile?.team_id,
    metadata: { mode: parsed.data.mode, minutes: parsed.data.minutes }
  });

  return NextResponse.json({ ok: true, id: data });
}



import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  coachUserId: z.string().uuid(),
  startAt: z.string().min(1),
  endAt: z.string().min(1)
});

export async function GET(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    coachUserId: url.searchParams.get("coachUserId"),
    startAt: url.searchParams.get("startAt"),
    endAt: url.searchParams.get("endAt")
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ error: "Invalid time range." }, { status: 400 });
  }

  const { data: busy, error } = await supabase.rpc("get_coach_busy", {
    p_coach_user_id: parsed.data.coachUserId,
    p_start_at: startAt.toISOString(),
    p_end_at: endAt.toISOString()
  });

  if (error) {
    console.error("get_coach_busy failed", error);
    return NextResponse.json({ error: "Unable to load availability." }, { status: 500 });
  }

  const { data: settings } = await supabase
    .from("coach_schedule_settings")
    .select("work_start_min, work_end_min, slot_min")
    .eq("coach_user_id", parsed.data.coachUserId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    settings: settings ?? { work_start_min: 480, work_end_min: 1080, slot_min: 15 },
    busy: busy ?? []
  });
}



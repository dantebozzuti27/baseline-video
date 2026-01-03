import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  primaryPlayerUserId: z.string().uuid(),
  secondPlayerUserId: z.string().uuid().optional(),
  mode: z.enum(["in_person", "remote"]),
  startAt: z.string().min(1),
  minutes: z.number().int().min(15).max(180),
  timezone: z.string().min(1).max(64).optional(),
  notes: z.string().max(2000).optional()
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

  const { data, error } = await supabase.rpc("create_lesson_as_coach", {
    p_primary_player_user_id: parsed.data.primaryPlayerUserId,
    p_second_player_user_id: parsed.data.secondPlayerUserId ?? null,
    p_mode: parsed.data.mode,
    p_start_at: startAt.toISOString(),
    p_minutes: parsed.data.minutes,
    p_timezone: parsed.data.timezone ?? "UTC",
    p_notes: parsed.data.notes ?? null
  });

  if (error) {
    console.error("create_lesson_as_coach failed", error);
    const raw = String((error as any)?.message ?? "");
    // Only show safe, user-facing errors. Keep internal diagnostics in server logs.
    const safeMsg =
      raw.includes("invalid_primary_player")
        ? "Choose a valid player on your team."
        : raw.includes("invalid_second_player")
          ? "Choose a valid second player."
          : raw.includes("blocked")
            ? "That time is blocked off."
            : raw.includes("conflict")
              ? "You already have a lesson at that time."
              : raw.includes("invalid_duration")
                ? "Choose a duration between 15 and 180 minutes."
                : raw.includes("forbidden") || raw.includes("permission denied")
                  ? "You don’t have permission to schedule lessons."
                  : "Unable to schedule lesson.";
    return NextResponse.json({ error: safeMsg }, { status: 400 });
  }

  // Sanity check: ensure lesson row exists & is visible after creation.
  const lessonId = data as string | null;
  if (!lessonId) return NextResponse.json({ error: "Unable to schedule lesson." }, { status: 500 });

  const { data: row, error: selErr } = await supabase.from("lessons").select("id").eq("id", lessonId).maybeSingle();
  if (selErr) {
    console.error("post-create lessons select failed", selErr);
    return NextResponse.json({ ok: true, id: lessonId });
  }
  if (!row) {
    console.error("post-create sanity check: lesson not visible/returned", { lessonId });
    return NextResponse.json({ error: "Unable to schedule lesson." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: lessonId });
}



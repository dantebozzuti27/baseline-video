import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  body: z.string().min(1).max(4000),
  timestampSeconds: z.number().int().min(0).nullable().optional(),
  visibility: z.enum(["team", "player_private", "coach_only"]).optional()
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if ((profile as any)?.is_active === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await supabase.from("comments").insert({
    video_id: params.id,
    author_user_id: user.id,
    body: parsed.data.body,
    timestamp_seconds: parsed.data.timestampSeconds ?? null,
    visibility: parsed.data.visibility ?? "team"
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update last_activity_at for true unread (only for team-visible comments).
  if ((parsed.data.visibility ?? "team") === "team") {
    await supabase.from("videos").update({ last_activity_at: new Date().toISOString() }).eq("id", params.id);
  }

  return NextResponse.json({ ok: true });
}



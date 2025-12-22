import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  userId: z.string().uuid(),
  active: z.boolean()
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

  const { error } = await supabase.rpc("set_player_active", {
    p_user_id: parsed.data.userId,
    p_active: parsed.data.active
  });

  if (error) {
    return NextResponse.json(
      { error: error.message + " (Run supabase/migrations/0008_sprint2_invites_events_activity_roster.sql)" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

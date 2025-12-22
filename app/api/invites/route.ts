import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  expiresMinutes: z.number().int().min(5).max(60 * 24 * 30).optional()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { data, error } = await supabase.rpc("create_invite_link", {
    p_expires_minutes: parsed.data.expiresMinutes ?? 60 * 24 * 7
  });

  if (error) {
    return NextResponse.json(
      { error: error.message + " (Run supabase/migrations/0008_sprint2_invites_events_activity_roster.sql)" },
      { status: 500 }
    );
  }

  return NextResponse.json({ token: data });
}

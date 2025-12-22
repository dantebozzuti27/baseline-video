import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc("touch_last_seen_feed");
  if (error) {
    return NextResponse.json(
      { error: error.message + " (Run supabase/migrations/0007_fast_wins_coach_features.sql)" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

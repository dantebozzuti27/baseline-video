import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("rotate_team_access_code");

  if (error) {
    const msg = error.message || "Unable to rotate access code";
    const status = msg.includes("forbidden") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ accessCode: data });
}

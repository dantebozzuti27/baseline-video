import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  
  // Debug logging
  console.log("[team/invite] User:", user.id, user.email);
  console.log("[team/invite] Profile:", profile, "Error:", profileError);
  
  if ((profile as any)?.is_active === false) {
    console.log("[team/invite] Rejected: is_active=false");
    return NextResponse.json({ error: "Forbidden", reason: "inactive" }, { status: 403 });
  }
  if ((profile as any)?.role !== "coach") {
    console.log("[team/invite] Rejected: role is", (profile as any)?.role);
    return NextResponse.json({ error: "Forbidden", reason: "not_coach", role: (profile as any)?.role }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_or_create_team_invite");
  if (error || !data) {
    console.error("get_or_create_team_invite failed", error);
    return NextResponse.json({ error: "Unable to load team invite." }, { status: 500 });
  }

  return NextResponse.json({ token: data });
}



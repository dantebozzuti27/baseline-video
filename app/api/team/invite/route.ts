import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use admin client to bypass RLS for profile check
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, is_active, team_id")
    .eq("user_id", user.id)
    .maybeSingle();
  
  // Debug logging
  console.log("[team/invite] User:", user.id, user.email);
  console.log("[team/invite] Profile:", profile, "Error:", profileError);
  
  if (!profile) {
    console.log("[team/invite] Rejected: no profile found");
    return NextResponse.json({ error: "Forbidden", reason: "no_profile" }, { status: 403 });
  }
  if ((profile as any)?.is_active === false) {
    console.log("[team/invite] Rejected: is_active=false");
    return NextResponse.json({ error: "Forbidden", reason: "inactive" }, { status: 403 });
  }
  if ((profile as any)?.role !== "coach") {
    console.log("[team/invite] Rejected: role is", (profile as any)?.role);
    return NextResponse.json({ error: "Forbidden", reason: "not_coach", role: (profile as any)?.role }, { status: 403 });
  }

  const teamId = profile.team_id;

  // Check for existing invite
  const { data: existingInvite } = await admin
    .from("invites")
    .select("token")
    .eq("team_id", teamId)
    .is("expires_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingInvite?.token) {
    return NextResponse.json({ token: existingInvite.token });
  }

  // Create new invite
  const token = crypto.randomBytes(24).toString("hex");
  const { error: insertError } = await admin
    .from("invites")
    .insert({
      team_id: teamId,
      created_by_user_id: user.id,
      token,
      expires_at: null,
      max_uses: 100000
    });

  if (insertError) {
    console.error("[team/invite] Insert failed", insertError);
    return NextResponse.json({ error: "Unable to create team invite." }, { status: 500 });
  }

  return NextResponse.json({ token });
}



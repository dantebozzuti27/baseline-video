import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST: Complete the claim (create profile from invite)
export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const accessToken = authHeader.slice(7);
    const admin = createSupabaseAdminClient();

    // Verify the token and get user
    const { data: { user }, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get the pending invite
    const { data: invite, error: inviteError } = await admin
      .from("pending_player_invites")
      .select("*")
      .eq("claim_token", params.token)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Invalid claim link" }, { status: 404 });
    }

    if (invite.claimed_at) {
      return NextResponse.json({ error: "Already claimed" }, { status: 409 });
    }

    if (new Date(invite.claim_token_expires_at) < new Date()) {
      return NextResponse.json({ error: "Claim link expired" }, { status: 410 });
    }

    // Create the profile
    const { error: profileError } = await admin
      .from("profiles")
      .insert({
        user_id: user.id,
        team_id: invite.team_id,
        role: "player",
        first_name: invite.first_name,
        last_name: invite.last_name,
        display_name: invite.display_name,
        player_mode: invite.player_mode,
        is_active: true
      });

    if (profileError) {
      console.error("Create profile error:", profileError);
      return NextResponse.json({ error: "Unable to create profile" }, { status: 500 });
    }

    // Mark invite as claimed
    await admin
      .from("pending_player_invites")
      .update({
        claimed_at: new Date().toISOString(),
        claimed_by_user_id: user.id
      })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/claim/[token]/complete error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/auth/profile";

// POST: Regenerate claim token for pending invite
export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const profile = await getMyProfile();
    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    
    // Find the pending invite (userId is actually inviteId for pending invites)
    const { data: invite } = await admin
      .from("pending_player_invites")
      .select("id, team_id, claimed_at")
      .eq("id", params.userId)
      .maybeSingle();

    if (!invite || invite.team_id !== profile.team_id) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.claimed_at) {
      return NextResponse.json({ error: "Already claimed" }, { status: 400 });
    }

    // Generate new token
    const newToken = generateClaimToken();

    await admin
      .from("pending_player_invites")
      .update({
        claim_token: newToken,
        claim_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq("id", params.userId);

    return NextResponse.json({
      claimToken: newToken,
      claimUrl: `/claim/${newToken}`
    });
  } catch (e) {
    console.error("POST /api/team/players/[userId]/claim error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE: Delete pending invite
export async function DELETE(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const profile = await getMyProfile();
    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    const { error } = await admin
      .from("pending_player_invites")
      .delete()
      .eq("id", params.userId)
      .eq("team_id", profile.team_id);

    if (error) {
      console.error("Delete invite error:", error);
      return NextResponse.json({ error: "Unable to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/team/players/[userId]/claim error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function generateClaimToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

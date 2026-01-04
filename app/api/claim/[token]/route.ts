import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET: Preview claim info (no auth required)
export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const admin = createSupabaseAdminClient();
    
    // Look up in pending_player_invites
    const { data: invite, error } = await admin
      .from("pending_player_invites")
      .select(`
        id,
        first_name,
        last_name,
        display_name,
        claim_token_expires_at,
        claimed_at,
        team:teams(name),
        creator:profiles!pending_player_invites_created_by_user_id_fkey(display_name)
      `)
      .eq("claim_token", params.token)
      .maybeSingle();

    if (error) {
      console.error("get_claim_info error:", error);
      return NextResponse.json({ error: "Unable to get claim info" }, { status: 500 });
    }

    if (!invite) {
      return NextResponse.json({ error: "Invalid claim link" }, { status: 404 });
    }

    const isExpired = new Date(invite.claim_token_expires_at) < new Date();
    const isClaimed = invite.claimed_at !== null;

    return NextResponse.json({
      inviteId: invite.id,
      firstName: invite.first_name,
      lastName: invite.last_name,
      teamName: (invite.team as any)?.name ?? "Unknown Team",
      coachName: (invite.creator as any)?.display_name ?? "Your Coach",
      isExpired,
      isClaimed
    });
  } catch (e) {
    console.error("GET /api/claim/[token] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST: Complete the claim (link new auth user to profile)
export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    // Get the new user ID from the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
    }

    const accessToken = authHeader.slice(7);
    const supabase = createSupabaseAdminClient();

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Claim the account
    const { data, error } = await supabase.rpc("claim_player_account", {
      p_claim_token: params.token,
      p_new_user_id: user.id
    });

    if (error) {
      console.error("claim_player_account error:", error);
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("expired")) {
        return NextResponse.json({ error: "Claim link expired" }, { status: 410 });
      }
      if (msg.includes("already claimed")) {
        return NextResponse.json({ error: "Account already claimed" }, { status: 409 });
      }
      if (msg.includes("invalid")) {
        return NextResponse.json({ error: "Invalid claim link" }, { status: 404 });
      }
      return NextResponse.json({ error: "Unable to claim account" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/claim/[token]/complete error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


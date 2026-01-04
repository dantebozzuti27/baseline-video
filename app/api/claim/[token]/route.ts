import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET: Preview claim info (no auth required)
export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("get_claim_info", {
      p_claim_token: params.token
    });

    if (error) {
      console.error("get_claim_info error:", error);
      return NextResponse.json({ error: "Unable to get claim info" }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.is_valid) {
      return NextResponse.json({ error: "Invalid claim link" }, { status: 404 });
    }

    return NextResponse.json({
      playerId: result.player_id,
      firstName: result.first_name,
      lastName: result.last_name,
      teamName: result.team_name,
      coachName: result.coach_name,
      isExpired: result.is_expired,
      isClaimed: result.is_claimed
    });
  } catch (e) {
    console.error("GET /api/claim/[token] error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


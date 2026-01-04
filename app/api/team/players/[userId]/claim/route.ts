import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

// POST: Regenerate claim token
export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const profile = await getMyProfile();
    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("regenerate_claim_token", {
      p_player_id: params.userId
    });

    if (error) {
      console.error("regenerate_claim_token error:", error);
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("claimed")) {
        return NextResponse.json({ error: "Cannot regenerate for claimed account" }, { status: 400 });
      }
      return NextResponse.json({ error: "Unable to regenerate token" }, { status: 500 });
    }

    return NextResponse.json({
      claimToken: data,
      claimUrl: `/claim/${data}`
    });
  } catch (e) {
    console.error("POST /api/team/players/[userId]/claim error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE: Delete unclaimed player
export async function DELETE(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const profile = await getMyProfile();
    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_unclaimed_player", {
      p_player_id: params.userId
    });

    if (error) {
      console.error("delete_unclaimed_player error:", error);
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("claimed")) {
        return NextResponse.json({ error: "Cannot delete claimed account" }, { status: 400 });
      }
      return NextResponse.json({ error: "Unable to delete player" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/team/players/[userId]/claim error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


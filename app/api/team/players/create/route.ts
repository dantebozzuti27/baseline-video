import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

const createSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  playerMode: z.enum(["in_person", "hybrid", "remote"]).optional()
});

export async function POST(req: Request) {
  try {
    const profile = await getMyProfile();
    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_unclaimed_player", {
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName,
      p_player_mode: parsed.data.playerMode ?? "in_person"
    });

    if (error) {
      console.error("create_unclaimed_player error:", error);
      return NextResponse.json({ error: "Unable to create player" }, { status: 500 });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      playerId: result?.player_id,
      claimToken: result?.claim_token,
      claimUrl: result?.claim_url
    });
  } catch (e) {
    console.error("POST /api/team/players/create error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


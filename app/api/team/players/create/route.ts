import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
      console.error("Validation failed:", parsed.error);
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Generate claim token
    const claimToken = generateClaimToken();

    // Use admin client to insert
    const admin = createSupabaseAdminClient();

    // Insert with NULL user_id - will be set when player claims account
    const { data: inserted, error: insertError } = await admin
      .from("profiles")
      .insert({
        user_id: null, // NULL until claimed - no FK violation
        team_id: profile.team_id,
        role: "player",
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        display_name: `${parsed.data.firstName} ${parsed.data.lastName}`,
        player_mode: parsed.data.playerMode ?? "in_person",
        is_active: true,
        claim_token: claimToken,
        claim_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_by_user_id: user.id
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert player error:", JSON.stringify(insertError, null, 2));
      return NextResponse.json({ 
        error: `Database error: ${insertError.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({
      playerId: inserted?.id,
      claimToken,
      claimUrl: `/claim/${claimToken}`
    });
  } catch (e: any) {
    console.error("POST /api/team/players/create error:", e?.message || e);
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

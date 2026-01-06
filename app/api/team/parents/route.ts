import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GET - List all parents linked to players on coach's team
export async function GET() {
  const supabase = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify coach role
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all players on the team
  const { data: players } = await admin
    .from("profiles")
    .select("user_id, display_name")
    .eq("team_id", profile.team_id)
    .eq("role", "player");

  const playerIds = players?.map((p) => p.user_id) || [];

  if (playerIds.length === 0) {
    return NextResponse.json({ parents: [], links: [] });
  }

  // Get all parent-player links for these players
  const { data: links } = await admin
    .from("parent_player_links")
    .select("id, parent_user_id, player_user_id, access_level, created_at")
    .in("player_user_id", playerIds);

  const parentIds = [...new Set(links?.map((l) => l.parent_user_id) || [])];

  // Get parent profiles
  const { data: parents } = parentIds.length > 0
    ? await admin
        .from("profiles")
        .select("user_id, display_name, first_name, last_name")
        .in("user_id", parentIds)
    : { data: [] };

  return NextResponse.json({
    parents: parents || [],
    links: links || [],
    players: players || []
  });
}

// POST - Link a parent to a player
const linkSchema = z.object({
  parentUserId: z.string().uuid(),
  playerUserId: z.string().uuid(),
  accessLevel: z.enum(["view_only", "full"]).optional().default("view_only")
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = linkSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.rpc("link_parent_to_player", {
      p_parent_user_id: parsed.data.parentUserId,
      p_player_user_id: parsed.data.playerUserId,
      p_access_level: parsed.data.accessLevel
    });

    if (error) {
      console.error("link_parent_to_player failed:", error);
      const msg = error.message || "";
      if (msg.includes("forbidden")) {
        return NextResponse.json({ error: "Only coaches can link parents" }, { status: 403 });
      }
      if (msg.includes("parent_not_found")) {
        return NextResponse.json({ error: "Parent not found" }, { status: 404 });
      }
      if (msg.includes("player_not_found")) {
        return NextResponse.json({ error: "Player not found on your team" }, { status: 404 });
      }
      if (msg.includes("team_mismatch")) {
        return NextResponse.json({ error: "Parent and player must be on the same team" }, { status: 400 });
      }
      return NextResponse.json({ error: "Unable to link parent" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, linkId: data });
  } catch (e: any) {
    console.error("POST /api/team/parents error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE - Unlink a parent from a player
const unlinkSchema = z.object({
  parentUserId: z.string().uuid(),
  playerUserId: z.string().uuid()
});

export async function DELETE(req: Request) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = unlinkSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.rpc("unlink_parent_from_player", {
      p_parent_user_id: parsed.data.parentUserId,
      p_player_user_id: parsed.data.playerUserId
    });

    if (error) {
      console.error("unlink_parent_from_player failed:", error);
      return NextResponse.json({ error: "Unable to unlink parent" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/team/parents error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";

export async function GET(req: NextRequest) {
  const profile = await getMyProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ videos: [], players: [], programs: [] });
  }

  const supabase = createSupabaseServerClient();
  const isCoach = profile.role === "coach";
  const pattern = `%${q}%`;

  // Search videos
  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, category, created_at")
    .eq("team_id", profile.team_id)
    .is("deleted_at", null)
    .ilike("title", pattern)
    .order("created_at", { ascending: false })
    .limit(8);

  // Search players (coach only)
  let players: any[] = [];
  if (isCoach) {
    const { data: playersData } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name")
      .eq("team_id", profile.team_id)
      .eq("role", "player")
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},display_name.ilike.${pattern}`)
      .limit(6);
    players = playersData ?? [];
  }

  // Search programs (coach only)
  let programs: any[] = [];
  if (isCoach) {
    const { data: programsData } = await supabase
      .from("program_templates")
      .select("id, title")
      .eq("coach_user_id", profile.user_id)
      .ilike("title", pattern)
      .limit(6);
    programs = programsData ?? [];
  }

  return NextResponse.json({ videos: videos ?? [], players, programs });
}


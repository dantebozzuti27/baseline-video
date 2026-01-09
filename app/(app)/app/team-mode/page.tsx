import { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TeamModeDashboard from "./TeamModeDashboard";

export const metadata: Metadata = {
  title: "Team Mode | Baseline Video",
};

export default async function TeamModePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/onboarding");
  }

  const isCoach = profile.role === "coach";

  // Get stats
  const [filesResult, insightsResult, reportsResult, opponentsResult] = await Promise.all([
    supabase
      .from("performance_data_files")
      .select("id, is_opponent_data, processing_status", { count: "exact" })
      .eq("team_id", profile.team_id),
    supabase
      .from("data_insights")
      .select("id", { count: "exact" })
      .eq("team_id", profile.team_id)
      .is("dismissed_at", null),
    supabase
      .from("scouting_reports")
      .select("id, report_category", { count: "exact" })
      .eq("team_id", profile.team_id),
    supabase
      .from("opponents")
      .select("id", { count: "exact" })
      .eq("team_id", profile.team_id),
  ]);

  const files = filesResult.data || [];
  const ownTeamFiles = files.filter((f) => !f.is_opponent_data).length;
  const opponentFiles = files.filter((f) => f.is_opponent_data).length;

  const reports = reportsResult.data || [];
  const ownTeamReports = reports.filter((r) => r.report_category === "own_team").length;
  const opponentReports = reports.filter((r) => r.report_category === "opponent").length;

  const stats = {
    totalFiles: files.length,
    ownTeamFiles,
    opponentFiles,
    activeInsights: insightsResult.count || 0,
    totalReports: reports.length,
    ownTeamReports,
    opponentReports,
    opponentsScouted: opponentsResult.count || 0,
  };

  // Get recent files
  const { data: recentFiles } = await supabase
    .from("performance_data_files")
    .select(
      `
      id,
      file_name,
      is_opponent_data,
      opponent_name,
      processing_status,
      row_count,
      created_at,
      player:profiles!performance_data_files_player_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      )
    `
    )
    .eq("team_id", profile.team_id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get recent insights
  const { data: recentInsights } = await supabase
    .from("data_insights")
    .select(
      `
      id,
      insight_type,
      title,
      description,
      confidence_score,
      is_opponent_insight,
      opponent_name,
      created_at,
      player:profiles!data_insights_player_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      )
    `
    )
    .eq("team_id", profile.team_id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  // Get recent reports
  const { data: recentReports } = await supabase
    .from("scouting_reports")
    .select(
      `
      id,
      title,
      report_category,
      report_type,
      status,
      game_date,
      shared_with_player,
      created_at,
      player:profiles!scouting_reports_player_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      )
    `
    )
    .eq("team_id", profile.team_id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Transform the data to flatten the player relation (Supabase returns arrays for joins)
  const transformedFiles = (recentFiles || []).map((f: any) => ({
    ...f,
    player: Array.isArray(f.player) ? f.player[0] || null : f.player,
  }));

  const transformedInsights = (recentInsights || []).map((i: any) => ({
    ...i,
    player: Array.isArray(i.player) ? i.player[0] || null : i.player,
  }));

  const transformedReports = (recentReports || []).map((r: any) => ({
    ...r,
    player: Array.isArray(r.player) ? r.player[0] || null : r.player,
  }));

  return (
    <div className="container bvAnimSlideUp">
      <TeamModeDashboard
        isCoach={isCoach}
        stats={stats}
        recentFiles={transformedFiles}
        recentInsights={transformedInsights}
        recentReports={transformedReports}
      />
    </div>
  );
}

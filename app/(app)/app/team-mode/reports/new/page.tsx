import { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ReportWizard from "./ReportWizard";

export const metadata: Metadata = {
  title: "Create Report | Team Mode",
};

export default async function NewReportPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "coach") {
    redirect("/app/team-mode");
  }

  // Get team players
  const { data: players } = await supabase
    .from("profiles")
    .select("user_id, display_name, first_name, last_name")
    .eq("team_id", profile.team_id)
    .eq("role", "player")
    .eq("is_active", true)
    .order("display_name");

  // Get opponents
  const { data: opponents } = await supabase
    .from("opponents")
    .select("id, name, opponent_type, sport_context")
    .eq("team_id", profile.team_id)
    .order("name");

  // Get data files
  const { data: files } = await supabase
    .from("performance_data_files")
    .select(
      `
      id,
      file_name,
      is_opponent_data,
      opponent_name,
      row_count,
      processing_status,
      created_at,
      detected_columns,
      player:profiles!performance_data_files_player_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      )
    `
    )
    .eq("team_id", profile.team_id)
    .eq("processing_status", "completed")
    .order("created_at", { ascending: false });

  // Transform data to flatten relations (Supabase returns arrays for joins)
  const transformedFiles = (files || []).map((f: any) => ({
    ...f,
    player: Array.isArray(f.player) ? f.player[0] || null : f.player,
  }));

  return (
    <div className="container bvAnimSlideUp">
      <ReportWizard
        players={players || []}
        opponents={opponents || []}
        files={transformedFiles}
      />
    </div>
  );
}

import { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import ReportViewClient from "./ReportViewClient";

export const metadata: Metadata = {
  title: "Scouting Report | Team Mode",
};

export default async function ReportViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get report
  const { data: report, error: reportError } = await supabase
    .from("scouting_reports")
    .select(
      `
      *,
      player:profiles!scouting_reports_player_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      ),
      creator:profiles!scouting_reports_creator_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      ),
      opponent:opponents(
        id,
        name,
        opponent_type,
        sport_context
      )
    `
    )
    .eq("id", id)
    .single();

  if (reportError || !report) {
    notFound();
  }

  // Get data sources
  const { data: dataSources } = await supabase
    .from("scouting_report_data_sources")
    .select(
      `
      id,
      data_file:performance_data_files(
        id,
        file_name,
        row_count,
        created_at
      )
    `
    )
    .eq("report_id", id);

  // Get profile for role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  // Transform data to flatten relations (Supabase returns arrays for joins)
  const transformedReport = {
    ...report,
    player: Array.isArray(report.player) ? report.player[0] || null : report.player,
    creator: Array.isArray(report.creator) ? report.creator[0] || null : report.creator,
    opponent: Array.isArray(report.opponent) ? report.opponent[0] || null : report.opponent,
  };

  const transformedDataSources = (dataSources || []).map((ds: any) => ({
    ...ds,
    data_file: Array.isArray(ds.data_file) ? ds.data_file[0] || null : ds.data_file,
  }));

  return (
    <div className="container bvAnimSlideUp">
      <ReportViewClient
        report={transformedReport}
        dataSources={transformedDataSources}
        isCoach={profile?.role === "coach"}
        currentUserId={user.id}
      />
    </div>
  );
}

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

  return (
    <div className="container bvAnimSlideUp">
      <ReportViewClient
        report={report}
        dataSources={dataSources || []}
        isCoach={profile?.role === "coach"}
        currentUserId={user.id}
      />
    </div>
  );
}

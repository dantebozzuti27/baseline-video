import { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import FileDetailClient from "./FileDetailClient";

export const metadata: Metadata = {
  title: "File Details | Team Mode",
};

export default async function FileDetailPage({
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

  // Get file details
  const { data: file, error: fileError } = await supabase
    .from("performance_data_files")
    .select(
      `
      *,
      player:profiles!performance_data_files_player_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      ),
      uploader:profiles!performance_data_files_uploader_user_id_fkey(
        user_id,
        display_name,
        first_name,
        last_name
      )
    `
    )
    .eq("id", id)
    .single();

  if (fileError || !file) {
    notFound();
  }

  // Get metrics (first 50 rows)
  const { data: metrics } = await supabase
    .from("performance_metrics")
    .select("*")
    .eq("data_file_id", id)
    .limit(50);

  // Get insights for this file
  const { data: insights } = await supabase
    .from("data_insights")
    .select("*")
    .eq("data_file_id", id)
    .is("dismissed_at", null)
    .order("confidence_score", { ascending: false });

  // Get profile for role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="container bvAnimSlideUp">
      <FileDetailClient
        file={file}
        metrics={metrics || []}
        insights={insights || []}
        isCoach={profile?.role === "coach"}
      />
    </div>
  );
}

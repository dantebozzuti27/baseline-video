import { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import UploadClient from "./UploadClient";

export const metadata: Metadata = {
  title: "Upload Performance Data | Team Mode",
};

export default async function UploadPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Get profile and check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "coach") {
    redirect("/app");
  }

  // Get team players for selection
  const { data: players } = await supabase
    .from("profiles")
    .select("user_id, display_name, first_name, last_name")
    .eq("team_id", profile.team_id)
    .eq("role", "player")
    .eq("is_active", true)
    .order("display_name");

  // Get existing opponents for autocomplete
  const { data: opponents } = await supabase
    .from("opponents")
    .select("id, name, opponent_type, sport_context")
    .eq("team_id", profile.team_id)
    .order("name");

  return (
    <div className="container bvAnimSlideUp">
      <UploadClient
        players={players || []}
        opponents={opponents || []}
      />
    </div>
  );
}

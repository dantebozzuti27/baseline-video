import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import EnrollmentWeeksClient from "./EnrollmentWeeksClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EnrollmentWeeksPage({ params }: { params: { enrollmentId: string } }) {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("Supabase admin client unavailable; falling back to RLS reads.", e);
  }
  const supabase = createSupabaseServerClient();
  const db = admin ?? supabase;

  const { data: enrollment } = await db
    .from("program_enrollments")
    .select("id, template_id, player_user_id, start_at, status")
    .eq("id", params.enrollmentId)
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .maybeSingle();

  if (!enrollment) redirect("/app/programs/enrollments");

  const { data: player } = await db
    .from("profiles")
    .select("user_id, display_name")
    .eq("user_id", enrollment.player_user_id)
    .maybeSingle();

  const { data: tmpl } = await db
    .from("program_templates")
    .select("id, title, weeks_count")
    .eq("id", enrollment.template_id)
    .eq("team_id", profile.team_id)
    .maybeSingle();

  if (!tmpl) redirect("/app/programs/enrollments");

  const { data: weeks } = await db
    .from("program_template_weeks")
    .select("week_index, goals_json, assignments_json")
    .eq("template_id", tmpl.id)
    .order("week_index", { ascending: true })
    .limit(80);

  const { data: overrides } = await db
    .from("program_week_overrides")
    .select("week_index, goals_json, assignments_json")
    .eq("enrollment_id", enrollment.id)
    .order("week_index", { ascending: true })
    .limit(80);

  return (
    <EnrollmentWeeksClient
      enrollment={{
        id: enrollment.id,
        template_id: enrollment.template_id,
        player_user_id: enrollment.player_user_id,
        status: enrollment.status
      }}
      player={{ display_name: player?.display_name ?? "Player" }}
      template={{ id: tmpl.id, title: tmpl.title, weeks_count: tmpl.weeks_count }}
      weeks={(weeks ?? []).map((w: any) => ({
        week_index: w.week_index,
        goals: Array.isArray(w.goals_json) ? w.goals_json : [],
        assignments: Array.isArray(w.assignments_json) ? w.assignments_json : []
      }))}
      overrides={(overrides ?? []).map((w: any) => ({
        week_index: w.week_index,
        goals: Array.isArray(w.goals_json) ? w.goals_json : [],
        assignments: Array.isArray(w.assignments_json) ? w.assignments_json : []
      }))}
    />
  );
}



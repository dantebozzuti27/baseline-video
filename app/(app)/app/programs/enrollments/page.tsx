import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import EnrollmentsClient from "./EnrollmentsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgramEnrollmentsPage() {
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

  const { data: templates } = await db
    .from("program_templates")
    .select("id, title, weeks_count, created_at")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: players } = await db
    .from("profiles")
    .select("user_id, display_name, role, is_active")
    .eq("team_id", profile.team_id)
    .eq("role", "player")
    .eq("is_active", true)
    .order("display_name", { ascending: true })
    .limit(400);

  const { data: enrollments } = await db
    .from("program_enrollments")
    .select("id, template_id, player_user_id, start_at, status, created_at")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <EnrollmentsClient
      templates={(templates ?? []) as any}
      players={(players ?? []).map((p: any) => ({ user_id: p.user_id, display_name: p.display_name }))}
      enrollments={(enrollments ?? []) as any}
    />
  );
}



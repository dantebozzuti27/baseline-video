import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import TemplateEditorClient from "./TemplateEditorClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgramTemplatePage({ params }: { params: { templateId: string } }) {
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

  const { data: tmpl } = await db
    .from("program_templates")
    .select("id, title, weeks_count, created_at")
    .eq("id", params.templateId)
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .maybeSingle();

  if (!tmpl) redirect("/app/programs");

  const { data: weeks } = await db
    .from("program_template_weeks")
    .select("template_id, week_index, goals_json, assignments_json")
    .eq("template_id", tmpl.id)
    .order("week_index", { ascending: true })
    .limit(80);

  return (
    <TemplateEditorClient
      template={{
        id: tmpl.id,
        title: tmpl.title,
        weeks_count: tmpl.weeks_count
      }}
      weeks={(weeks ?? []).map((w: any) => ({
        week_index: w.week_index,
        goals: Array.isArray(w.goals_json) ? w.goals_json : [],
        assignments: Array.isArray(w.assignments_json) ? w.assignments_json : []
      }))}
    />
  );
}



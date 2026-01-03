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
    .select("id, title, weeks_count, cycle_days, created_at")
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

  const { data: focuses } = await db
    .from("program_focuses")
    .select("id, name")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: drills } = await db
    .from("program_drills")
    .select("id, title, category")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(400);

  const { data: days } = await db
    .from("program_template_days")
    .select("template_id, week_index, day_index, focus_id, note")
    .eq("template_id", tmpl.id)
    .limit(5000);

  const { data: dayAssignments } = await db
    .from("program_template_day_assignments")
    .select("id, template_id, week_index, day_index, drill_id, sets, reps, duration_min, requires_upload, upload_prompt, notes_to_player, sort_order")
    .eq("template_id", tmpl.id)
    .order("week_index", { ascending: true })
    .order("day_index", { ascending: true })
    .order("sort_order", { ascending: true })
    .limit(8000);

  return (
    <TemplateEditorClient
      template={{
        id: tmpl.id,
        title: tmpl.title,
        weeks_count: tmpl.weeks_count,
        cycle_days: (tmpl as any).cycle_days ?? 7
      }}
      weeks={(weeks ?? []).map((w: any) => ({
        week_index: w.week_index,
        goals: Array.isArray(w.goals_json) ? w.goals_json : [],
        assignments: Array.isArray(w.assignments_json) ? w.assignments_json : []
      }))}
      focuses={(focuses ?? []).map((f: any) => ({ id: f.id, name: f.name }))}
      drills={(drills ?? []).map((d: any) => ({ id: d.id, title: d.title, category: d.category }))}
      days={(days ?? []).map((d: any) => ({
        week_index: d.week_index,
        day_index: d.day_index,
        focus_id: d.focus_id ?? null,
        note: d.note ?? ""
      }))}
      dayAssignments={(dayAssignments ?? []).map((a: any) => ({
        id: a.id,
        week_index: a.week_index,
        day_index: a.day_index,
        drill_id: a.drill_id,
        sets: a.sets ?? null,
        reps: a.reps ?? null,
        duration_min: a.duration_min ?? null,
        requires_upload: Boolean(a.requires_upload),
        upload_prompt: a.upload_prompt ?? "",
        notes_to_player: a.notes_to_player ?? "",
        sort_order: a.sort_order ?? 0
      }))}
    />
  );
}



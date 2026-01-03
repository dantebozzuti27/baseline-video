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
    .select("id, title, weeks_count, cycle_days")
    .eq("id", enrollment.template_id)
    .eq("team_id", profile.team_id)
    .maybeSingle();

  if (!tmpl) redirect("/app/programs/enrollments");

  const cycleDays = Number((tmpl as any).cycle_days ?? 7) || 7;

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

  // Fetch template days
  const { data: templateDays } = await db
    .from("program_template_days")
    .select("id, template_id, week_index, day_index, focus_id, day_note")
    .eq("template_id", tmpl.id)
    .order("week_index", { ascending: true })
    .order("day_index", { ascending: true })
    .limit(500);

  // Fetch template day assignments
  const templateDayIds = (templateDays ?? []).map((d: any) => d.id);
  const { data: templateDayAssignments } = templateDayIds.length
    ? await db
        .from("program_template_day_assignments")
        .select("id, template_day_id, drill_id, sets, reps, minutes, requires_upload, upload_prompt, notes")
        .in("template_day_id", templateDayIds)
        .order("created_at", { ascending: true })
        .limit(2000)
    : { data: [] as any[] };

  // Fetch per-player day overrides
  const { data: dayOverrides } = await db
    .from("program_enrollment_day_overrides")
    .select("id, enrollment_id, week_index, day_index, focus_id, day_note, assignments_json")
    .eq("enrollment_id", enrollment.id)
    .order("week_index", { ascending: true })
    .order("day_index", { ascending: true })
    .limit(500);

  // Fetch focuses for display
  const { data: focuses } = await db
    .from("program_focuses")
    .select("id, name")
    .eq("team_id", profile.team_id)
    .limit(200);

  // Fetch drills for display
  const { data: drills } = await db
    .from("program_drills")
    .select("id, name")
    .eq("team_id", profile.team_id)
    .limit(500);

  return (
    <EnrollmentWeeksClient
      enrollment={{
        id: enrollment.id,
        template_id: enrollment.template_id,
        player_user_id: enrollment.player_user_id,
        status: enrollment.status
      }}
      player={{ display_name: player?.display_name ?? "Player" }}
      template={{ id: tmpl.id, title: tmpl.title, weeks_count: tmpl.weeks_count, cycle_days: cycleDays }}
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
      templateDays={(templateDays ?? []).map((d: any) => ({
        id: d.id,
        week_index: d.week_index,
        day_index: d.day_index,
        focus_id: d.focus_id,
        day_note: d.day_note
      }))}
      templateDayAssignments={(templateDayAssignments ?? []).map((a: any) => ({
        id: a.id,
        template_day_id: a.template_day_id,
        drill_id: a.drill_id,
        sets: a.sets,
        reps: a.reps,
        minutes: a.minutes,
        requires_upload: a.requires_upload,
        upload_prompt: a.upload_prompt,
        notes: a.notes
      }))}
      dayOverrides={(dayOverrides ?? []).map((d: any) => ({
        id: d.id,
        week_index: d.week_index,
        day_index: d.day_index,
        focus_id: d.focus_id,
        day_note: d.day_note,
        assignments: Array.isArray(d.assignments_json) ? d.assignments_json : []
      }))}
      focuses={(focuses ?? []).map((f: any) => ({ id: f.id, name: f.name }))}
      drills={(drills ?? []).map((d: any) => ({ id: d.id, name: d.name }))}
    />
  );
}



import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/auth/profile";

export async function POST(
  req: NextRequest,
  { params }: { params: { templateId: string } }
) {
  const profile = await getMyProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "coach") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createSupabaseAdminClient();

  // Fetch original template
  const { data: original, error: fetchError } = await admin
    .from("program_templates")
    .select("*")
    .eq("id", params.templateId)
    .eq("coach_user_id", profile.user_id)
    .maybeSingle();

  if (fetchError) {
    console.error("Fetch template error:", fetchError);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  }

  if (!original) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Create new template
  const { data: newTemplate, error: createError } = await admin
    .from("program_templates")
    .insert({
      team_id: profile.team_id,
      coach_user_id: profile.user_id,
      title: `${original.title} (Copy)`,
      weeks_count: original.weeks_count,
      cycle_days: original.cycle_days
    })
    .select("id")
    .single();

  if (createError || !newTemplate) {
    console.error("Failed to create duplicate template:", createError);
    return NextResponse.json({ error: "Failed to duplicate" }, { status: 500 });
  }

  const newId = newTemplate.id;

  // Copy weeks
  const { data: weeks } = await admin
    .from("program_template_weeks")
    .select("*")
    .eq("template_id", params.templateId);

  if (weeks && weeks.length > 0) {
    const weekInserts = weeks.map((w: any) => ({
      template_id: newId,
      week_index: w.week_index,
      goals_json: w.goals_json,
      assignments_json: w.assignments_json
    }));
    await admin.from("program_template_weeks").insert(weekInserts);
  }

  // Copy days
  const { data: days } = await admin
    .from("program_template_days")
    .select("*")
    .eq("template_id", params.templateId);

  if (days && days.length > 0) {
    const dayInserts = days.map((d: any) => ({
      template_id: newId,
      week_index: d.week_index,
      day_index: d.day_index,
      focus_id: d.focus_id,
      note: d.note
    }));
    await admin.from("program_template_days").insert(dayInserts);
  }

  // Copy day assignments
  const { data: assignments } = await admin
    .from("program_template_day_assignments")
    .select("*")
    .eq("template_id", params.templateId);

  if (assignments && assignments.length > 0) {
    const assignmentInserts = assignments.map((a: any) => ({
      template_id: newId,
      week_index: a.week_index,
      day_index: a.day_index,
      drill_id: a.drill_id,
      sets: a.sets,
      reps: a.reps,
      duration_min: a.duration_min,
      requires_upload: a.requires_upload,
      upload_prompt: a.upload_prompt,
      notes_to_player: a.notes_to_player,
      sort_order: a.sort_order
    }));
    await admin.from("program_template_day_assignments").insert(assignmentInserts);
  }

  return NextResponse.json({ id: newId, title: `${original.title} (Copy)` });
}

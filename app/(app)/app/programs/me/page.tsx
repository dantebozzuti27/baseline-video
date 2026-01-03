import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card } from "@/components/ui";
import TodayClient from "./TodayClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default async function MyProgramPage() {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "player") redirect("/app/programs");

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
    .select("id, template_id, coach_user_id, player_user_id, start_at, status")
    .eq("team_id", profile.team_id)
    .eq("player_user_id", profile.user_id)
    .eq("status", "active")
    .order("start_at", { ascending: false })
    .maybeSingle();

  if (!enrollment) {
    return (
      <div className="container" style={{ paddingTop: 18, maxWidth: 860 }}>
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>No program yet</div>
            <div className="muted" style={{ fontSize: 13 }}>
              When your coach enrolls you in a remote program, you’ll see your weekly plan and submissions here.
            </div>
            <div>
              <Link className="btn btnPrimary" href="/app">
                Go to feed
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { data: tmpl } = await db
    .from("program_templates")
    .select("id, title, weeks_count, cycle_days")
    .eq("id", enrollment.template_id)
    .eq("team_id", profile.team_id)
    .maybeSingle();

  if (!tmpl) redirect("/app");

  const start = new Date(enrollment.start_at);
  const now = new Date();
  const cycleDays = Number((tmpl as any)?.cycle_days ?? 7);
  const safeCycleDays = Number.isFinite(cycleDays) && cycleDays > 0 ? cycleDays : 7;
  const dayRaw = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const safeDayRaw = Number.isFinite(dayRaw) ? Math.max(1, dayRaw) : 1;
  const weekIndex = clamp(Math.floor((safeDayRaw - 1) / safeCycleDays) + 1, 1, tmpl.weeks_count);
  const dayIndex = clamp(((safeDayRaw - 1) % safeCycleDays) + 1, 1, safeCycleDays);

  const { data: dayPlan } = await db
    .from("program_template_days")
    .select("template_id, week_index, day_index, focus_id, note")
    .eq("template_id", tmpl.id)
    .eq("week_index", weekIndex)
    .eq("day_index", dayIndex)
    .maybeSingle();

  const { data: focus } = dayPlan?.focus_id
    ? await db.from("program_focuses").select("id, name, description, cues_json").eq("id", dayPlan.focus_id).maybeSingle()
    : ({ data: null } as any);

  const { data: dayAssignments } = await db
    .from("program_template_day_assignments")
    .select("id, drill_id, sets, reps, duration_min, requires_upload, upload_prompt, notes_to_player, sort_order")
    .eq("template_id", tmpl.id)
    .eq("week_index", weekIndex)
    .eq("day_index", dayIndex)
    .order("sort_order", { ascending: true })
    .limit(100);

  const drillIds = Array.from(new Set((dayAssignments ?? []).map((a: any) => a.drill_id).filter(Boolean)));
  const { data: drills } = drillIds.length
    ? await db
        .from("program_drills")
        .select("id, title, category, goal, cues_json, common_mistakes_json")
        .in("id", drillIds)
        .limit(400)
    : ({ data: [] as any[] } as any);

  const { data: media } = drillIds.length
    ? await db
        .from("program_drill_media")
        .select("id, drill_id, kind, video_id, external_url, title, sort_order")
        .in("drill_id", drillIds)
        .order("sort_order", { ascending: true })
        .limit(800)
    : ({ data: [] as any[] } as any);

  const assignmentIds = Array.from(new Set((dayAssignments ?? []).map((a: any) => a.id).filter(Boolean)));
  const { data: completions } = assignmentIds.length
    ? await db
        .from("program_assignment_completions")
        .select("assignment_id, completed_at")
        .eq("enrollment_id", enrollment.id)
        .in("assignment_id", assignmentIds)
        .limit(300)
    : ({ data: [] as any[] } as any);

  const { data: submissions } = assignmentIds.length
    ? await db
        .from("program_submissions")
        .select("id, assignment_id, created_at, video_id, note, videos:video_id(id, title, category)")
        .eq("enrollment_id", enrollment.id)
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: false })
        .limit(300)
    : ({ data: [] as any[] } as any);

  return (
    <TodayClient
      programTitle={tmpl.title}
      weekIndex={weekIndex}
      dayIndex={dayIndex}
      cycleDays={safeCycleDays}
      enrollmentId={enrollment.id}
      focus={
        focus
          ? {
              id: focus.id,
              name: focus.name,
              description: focus.description ?? null,
              cues: Array.isArray((focus as any).cues_json) ? ((focus as any).cues_json as any[]) : []
            }
          : null
      }
      dayNote={dayPlan?.note ?? ""}
      drills={(drills ?? []).map((d: any) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        goal: d.goal ?? null,
        cues: Array.isArray(d.cues_json) ? d.cues_json : [],
        mistakes: Array.isArray(d.common_mistakes_json) ? d.common_mistakes_json : []
      }))}
      media={(media ?? []).map((m: any) => ({
        id: m.id,
        drill_id: m.drill_id,
        kind: m.kind,
        video_id: m.video_id ?? null,
        external_url: m.external_url ?? null,
        title: m.title ?? null,
        sort_order: m.sort_order ?? 0
      }))}
      assignments={(dayAssignments ?? []).map((a: any) => ({
        id: a.id,
        drill_id: a.drill_id,
        sets: a.sets ?? null,
        reps: a.reps ?? null,
        duration_min: a.duration_min ?? null,
        requires_upload: Boolean(a.requires_upload),
        upload_prompt: a.upload_prompt ?? "",
        notes_to_player: a.notes_to_player ?? "",
        sort_order: a.sort_order ?? 0
      }))}
      completions={(completions ?? []).map((c: any) => ({ assignment_id: c.assignment_id, completed_at: c.completed_at }))}
      submissions={(submissions ?? []).map((s: any) => ({
        id: s.id,
        assignment_id: s.assignment_id,
        created_at: s.created_at,
        video_id: s.video_id,
        note: s.note ?? null,
        video_title: s.videos?.title ?? "Video",
        video_category: s.videos?.category ?? null
      }))}
    />
  );
}



import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import ProgramsNav from "../ProgramsNav";
import CoachProgramFeedClient from "./CoachProgramFeedClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgramFeedPage() {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app/programs/me/feed");

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("Supabase admin client unavailable; falling back to RLS reads.", e);
  }
  const supabase = createSupabaseServerClient();
  const db = admin ?? supabase;

  const { data: enrollments } = await db
    .from("program_enrollments")
    .select("id, player_user_id, template_id, start_at, status")
    .eq("team_id", profile.team_id)
    .eq("coach_user_id", profile.user_id)
    .limit(600);
  const enrollmentIds = Array.from(new Set((enrollments ?? []).map((e: any) => e.id).filter(Boolean)));
  const playerIds = Array.from(new Set((enrollments ?? []).map((e: any) => e.player_user_id).filter(Boolean)));

  const { data: submissions } = enrollmentIds.length
    ? await db
        .from("program_submissions")
        .select(
          "id, enrollment_id, week_index, day_index, assignment_id, note, created_at, video_id, videos:video_id(id, title, category, owner_user_id, created_at)"
        )
        .in("enrollment_id", enrollmentIds)
        .order("created_at", { ascending: false })
        .limit(400)
    : ({ data: [] as any[] } as any);

  const assignmentIds = Array.from(new Set((submissions ?? []).map((s: any) => s.assignment_id).filter(Boolean)));
  const { data: assignmentRows } = assignmentIds.length
    ? await db
        .from("program_template_day_assignments")
        .select("id, drill_id, week_index, day_index, requires_upload, upload_prompt, notes_to_player")
        .in("id", assignmentIds)
        .limit(800)
    : ({ data: [] as any[] } as any);
  const drillIds = Array.from(new Set((assignmentRows ?? []).map((a: any) => a.drill_id).filter(Boolean)));
  const { data: drillRows } = drillIds.length
    ? await db.from("program_drills").select("id, title, category").in("id", drillIds).limit(800)
    : ({ data: [] as any[] } as any);

  const drillById: Record<string, any> = {};
  for (const d of drillRows ?? []) drillById[d.id] = d;
  const assignmentById: Record<string, any> = {};
  for (const a of assignmentRows ?? []) assignmentById[a.id] = { ...a, drill: drillById[a.drill_id] };

  const submissionIds = Array.from(new Set((submissions ?? []).map((s: any) => s.id).filter(Boolean)));

  const { data: reviews } = submissionIds.length
    ? await db.from("program_reviews").select("id, submission_id, reviewed_at, review_note").in("submission_id", submissionIds)
    : ({ data: [] as any[] } as any);

  const { data: players } = playerIds.length
    ? await db.from("profiles").select("user_id, display_name").in("user_id", playerIds)
    : ({ data: [] as any[] } as any);
  const playerById: Record<string, string> = {};
  for (const p of players ?? []) playerById[p.user_id] = p.display_name;

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Programs</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          Review player submissions
        </div>
      </div>
      <ProgramsNav />
      <CoachProgramFeedClient
        enrollments={(enrollments ?? []) as any}
        submissions={(submissions ?? []).map((s: any) => ({ ...s, assignment: s.assignment_id ? assignmentById[s.assignment_id] : null })) as any}
        reviews={(reviews ?? []) as any}
        playerById={playerById}
      />
    </div>
  );
}



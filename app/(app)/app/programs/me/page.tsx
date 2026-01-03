import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card } from "@/components/ui";

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
  const weekRaw = Math.floor((now.getTime() - start.getTime()) / (safeCycleDays * 24 * 60 * 60 * 1000)) + 1;
  const weekIndex = clamp(weekRaw, 1, tmpl.weeks_count);

  const [{ data: baseWeek }, { data: overrideWeek }] = await Promise.all([
    db
      .from("program_template_weeks")
      .select("week_index, goals_json, assignments_json")
      .eq("template_id", tmpl.id)
      .eq("week_index", weekIndex)
      .maybeSingle(),
    db
      .from("program_week_overrides")
      .select("week_index, goals_json, assignments_json")
      .eq("enrollment_id", enrollment.id)
      .eq("week_index", weekIndex)
      .maybeSingle()
  ]);

  const goals = Array.isArray((overrideWeek as any)?.goals_json)
    ? ((overrideWeek as any).goals_json as any[])
    : Array.isArray((baseWeek as any)?.goals_json)
      ? ((baseWeek as any).goals_json as any[])
      : [];
  const assignments = Array.isArray((overrideWeek as any)?.assignments_json)
    ? ((overrideWeek as any).assignments_json as any[])
    : Array.isArray((baseWeek as any)?.assignments_json)
      ? ((baseWeek as any).assignments_json as any[])
      : [];

  const { data: submissions } = await db
    .from("program_submissions")
    .select("id, week_index, note, created_at, video_id, videos:video_id(id, title, category)")
    .eq("enrollment_id", enrollment.id)
    .eq("week_index", weekIndex)
    .order("created_at", { ascending: false })
    .limit(50);
  const submissionIds = Array.from(new Set((submissions ?? []).map((s: any) => s.id).filter(Boolean)));
  const { data: reviews } = submissionIds.length
    ? await db.from("program_reviews").select("submission_id, reviewed_at, review_note").in("submission_id", submissionIds)
    : ({ data: [] as any[] } as any);
  const reviewBySubmissionId: Record<string, any> = {};
  for (const r of reviews ?? []) reviewBySubmissionId[r.submission_id] = r;

  const qs = new URLSearchParams({
    programEnrollmentId: enrollment.id,
    programWeek: String(weekIndex),
    returnTo: "/app/programs/me"
  });

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 860 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{tmpl.title}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Week {weekIndex} of {tmpl.weeks_count}
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs/me/feed">
            Program feed
          </Link>
          <Link className="btn btnPrimary" href={`/app/upload?${qs.toString()}`}>
            Submit video
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Goals</div>
            {goals.length ? (
              <ul className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
                {goals.map((g: any, idx: number) => (
                  <li key={idx}>{String(g)}</li>
                ))}
              </ul>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No goals listed for this week.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="stack">
            <div style={{ fontWeight: 900 }}>Assignments</div>
            {assignments.length ? (
              <ul className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
                {assignments.map((a: any, idx: number) => (
                  <li key={idx}>{String(a)}</li>
                ))}
              </ul>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                No assignments listed for this week.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="stack">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 900 }}>Your submissions</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  Submit your swings here so your coach can review them.
                </div>
              </div>
              <Link className="btn btnPrimary" href={`/app/upload?${qs.toString()}`}>
                Submit
              </Link>
            </div>

            {(submissions ?? []).length ? (
              <div className="stack" style={{ gap: 10, marginTop: 12 }}>
                {(submissions ?? []).map((s: any) => {
                  const r = reviewBySubmissionId[s.id];
                  return (
                    <div key={s.id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>
                          {s.videos?.title ?? "Video"} {r ? <span className="pill">Reviewed</span> : <span className="pill">Awaiting review</span>}
                        </div>
                        {r?.review_note ? (
                          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                            {r.review_note}
                          </div>
                        ) : null}
                      </div>
                      <Link className="btn" href={`/app/videos/${s.video_id}`}>
                        Open
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                Nothing submitted yet this week.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}



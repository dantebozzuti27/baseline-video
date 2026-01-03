import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MyProgramFeedPage() {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "player") redirect("/app/programs/feed");

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
    .select("id, template_id, start_at, status")
    .eq("team_id", profile.team_id)
    .eq("player_user_id", profile.user_id)
    .order("start_at", { ascending: false })
    .limit(50);
  const enrollmentIds = Array.from(new Set((enrollments ?? []).map((e: any) => e.id).filter(Boolean)));

  const { data: submissions } = enrollmentIds.length
    ? await db
        .from("program_submissions")
        .select("id, enrollment_id, week_index, note, created_at, video_id, videos:video_id(id, title, category)")
        .in("enrollment_id", enrollmentIds)
        .order("created_at", { ascending: false })
        .limit(400)
    : ({ data: [] as any[] } as any);
  const submissionIds = Array.from(new Set((submissions ?? []).map((s: any) => s.id).filter(Boolean)));
  const { data: reviews } = submissionIds.length
    ? await db.from("program_reviews").select("submission_id, reviewed_at, review_note").in("submission_id", submissionIds)
    : ({ data: [] as any[] } as any);
  const reviewBySubmissionId: Record<string, any> = {};
  for (const r of reviews ?? []) reviewBySubmissionId[r.submission_id] = r;

  return (
    <div className="container" style={{ paddingTop: 18, maxWidth: 860 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Program feed</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Your program submissions and coach reviews.
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs/me">
            This week
          </Link>
          <Link className="btn" href="/app">
            Main feed
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {(submissions ?? []).length ? (
          (submissions ?? []).map((s: any) => {
            const r = reviewBySubmissionId[s.id];
            return (
              <Card key={s.id}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      Week {s.week_index} • {s.videos?.title ?? "Video"}{" "}
                      {r ? <span className="pill">Reviewed</span> : <span className="pill">Awaiting review</span>}
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
              </Card>
            );
          })
        ) : (
          <Card>
            <div className="muted" style={{ fontSize: 13 }}>
              Nothing in your program feed yet.
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}



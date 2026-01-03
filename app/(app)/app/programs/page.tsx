import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgramsHomePage() {
  noStore();
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");

  if (profile.role !== "coach") {
    redirect("/app/programs/me");
  }

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

  return (
    <div className="container" style={{ paddingTop: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Programs</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Build a remote plan, enroll players, and review submissions in one place.
          </div>
        </div>
        <div className="row">
          <Link className="btn" href="/app/programs/feed">
            Feed
          </Link>
          <Link className="btn" href="/app/programs/library">
            Library
          </Link>
          <Link className="btn" href="/app/programs/enrollments">
            Enrollments
          </Link>
          <Link className="btn btnPrimary" href="/app/programs/new">
            New program
          </Link>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        {(templates ?? []).length ? (
          (templates ?? []).map((t: any) => (
            <Card key={t.id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{t.title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                    {t.weeks_count} weeks
                  </div>
                </div>
                <Link className="btn btnPrimary" href={`/app/programs/${t.id}`}>
                  Edit
                </Link>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <div className="stack">
              <div style={{ fontWeight: 900 }}>No programs yet</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Create a week-by-week template, then enroll players into it.
              </div>
              <div>
                <Link className="btn btnPrimary" href="/app/programs/new">
                  Create your first program
                </Link>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900 }}>Program feed</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                A dedicated stream of program submissions and reviews (separate from the normal library).
              </div>
            </div>
            <Link className="btn" href="/app/programs/feed">
              Open feed
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}



import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";
import { LocalDateTime } from "@/components/LocalDateTime";
import { EmptyState } from "@/components/EmptyState";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import type { VideoCategory } from "@/lib/db/types";

export default async function LibraryPage({
  searchParams
}: {
  searchParams: { cat?: string; sort?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  const isCoach = profile.role === "coach";

  const category = (searchParams.cat ?? "all") as "all" | VideoCategory;
  const sort = searchParams.sort === "oldest" ? "oldest" : searchParams.sort === "activity" ? "activity" : "recent";

  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("videos")
    .select("id, title, category, created_at, pinned, last_activity_at")
    .eq("team_id", profile.team_id)
    .eq("is_library", true)
    .is("deleted_at", null)
    .order(sort === "activity" ? "last_activity_at" : "created_at", { ascending: sort === "oldest" });
  if (category !== "all") query = query.eq("category", category);

  const { data: videos } = await query;
  const pinned = (videos ?? []).filter((v: any) => v.pinned);
  const rest = (videos ?? []).filter((v: any) => !v.pinned);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{isCoach ? "Coach library" : "Team library"}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Reference videos visible to the whole team.
          </div>
        </div>
        <LinkButton href={isCoach ? "/app/dashboard" : "/app"}>Back</LinkButton>
      </div>

      <Card>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row">
            <Link className="pill" href={`/app/library?cat=all&sort=${sort}`}>
              All
            </Link>
            <Link className="pill" href={`/app/library?cat=game&sort=${sort}`}>
              Game
            </Link>
            <Link className="pill" href={`/app/library?cat=training&sort=${sort}`}>
              Training
            </Link>
          </div>
          <div className="row">
            <Link className="pill" href={`/app/library?cat=${category}&sort=recent`}>
              Recent
            </Link>
            <Link className="pill" href={`/app/library?cat=${category}&sort=oldest`}>
              Oldest
            </Link>
            <Link className="pill" href={`/app/library?cat=${category}&sort=activity`}>
              Activity
            </Link>
          </div>
        </div>
      </Card>

      {pinned.length > 0 ? (
        <div className="stack">
          <div style={{ fontWeight: 900 }}>Pinned</div>
          <div className="stack bvStagger">
            {pinned.map((v: any) => (
              <Link key={v.id} href={`/app/videos/${v.id}`}>
                <div className="card cardInteractive">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{v.title}</div>
                    <div className="row" style={{ alignItems: "center" }}>
                      <div className="pill pillInfo">LIBRARY</div>
                      <div className="pill pillWarning">PINNED</div>
                      <div className="pill">{String(v.category).toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Visible to: Team
                  </div>
                  <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    <LocalDateTime value={v.created_at} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {rest && rest.length > 0 ? (
        <div className="stack bvStagger">
          {rest.map((v: any) => (
            <Link key={v.id} href={`/app/videos/${v.id}`}>
              <div className="card cardInteractive">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{v.title}</div>
                  <div className="row" style={{ alignItems: "center" }}>
                    <div className="pill pillInfo">LIBRARY</div>
                    <div className="pill">{String(v.category).toUpperCase()}</div>
                  </div>
                </div>
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Visible to: Team
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  <LocalDateTime value={v.created_at} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          variant="library"
          title="No library videos yet"
          message={isCoach
            ? "Open any video and use Coach controls → Add to library."
            : "Ask your coach to add a video to the team library."
          }
          actionLabel={isCoach ? "Go to dashboard" : undefined}
          actionHref={isCoach ? "/app/dashboard" : undefined}
        />
      )}
    </div>
  );
}



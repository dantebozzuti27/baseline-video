import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalDateTime } from "@/components/LocalDateTime";
import FeedClient from "./FeedClient";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VideoCategory } from "@/lib/db/types";
import { Card, LinkButton } from "@/components/ui";

export default async function AppHomePage({
  searchParams
}: {
  searchParams: { cat?: string; sort?: string };
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/onboarding");

  if (profile.role === "coach") {
    redirect("/app/dashboard");
  }

  const category = (searchParams.cat ?? "all") as "all" | VideoCategory;
  const sort = searchParams.sort === "oldest" ? "oldest" : searchParams.sort === "activity" ? "activity" : "recent";

  const supabase = createSupabaseServerClient();

  // Load last_seen_feed_at (for "NEW" badges)
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("last_seen_feed_at")
    .eq("user_id", profile.user_id)
    .maybeSingle();

  const lastSeen = myProfile?.last_seen_feed_at ? new Date(myProfile.last_seen_feed_at).getTime() : 0;

  // We don't have true last-activity persisted yet; "activity" currently approximates by created_at.
  let query = supabase
    .from("videos")
    .select("id, title, category, created_at, pinned, is_library, last_activity_at")
    .is("deleted_at", null)
    .order(sort === "activity" ? "last_activity_at" : "created_at", {
      ascending: sort === "oldest"
    });
  if (category !== "all") query = query.eq("category", category);

  const { data: videos } = await query;
  const ids = (videos ?? []).map((v: any) => v.id);
  const { data: views } = ids.length
    ? await supabase.from("video_views").select("video_id, last_seen_at").in("video_id", ids)
    : { data: [] as any[] };
  const seenMap = new Map<string, number>();
  for (const vv of views ?? []) {
    seenMap.set(vv.video_id, new Date(vv.last_seen_at).getTime());
  }

  const pinned = (videos ?? []).filter((v: any) => v.pinned);
  const rest = (videos ?? []).filter((v: any) => !v.pinned);

  return (
    <div className="stack">
      <FeedClient />

      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Your videos</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Upload, filter, and review.
          </div>
        </div>
        <LinkButton href="/app/upload" variant="primary">
          Upload
        </LinkButton>
      </div>

      <Card>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row">
            <Link className="pill" href={`/app?cat=all&sort=${sort}`}>
              All
            </Link>
            <Link className="pill" href={`/app?cat=game&sort=${sort}`}>
              Game
            </Link>
            <Link className="pill" href={`/app?cat=training&sort=${sort}`}>
              Training
            </Link>
          </div>
          <div className="row">
            <Link className="pill" href={`/app?cat=${category}&sort=recent`}>
              Recent
            </Link>
            <Link className="pill" href={`/app?cat=${category}&sort=oldest`}>
              Oldest
            </Link>
            <Link className="pill" href={`/app?cat=${category}&sort=activity`}>
              Activity
            </Link>
          </div>
        </div>
      </Card>

      {pinned.length > 0 ? (
        <div className="stack">
          <div style={{ fontWeight: 900 }}>Pinned</div>
          {pinned.map((v: any) => (
            <Link key={v.id} href={`/app/videos/${v.id}`}>
              <div className="card">
                {(() => {
                  const activity = new Date(v.last_activity_at ?? v.created_at).getTime();
                  const seen = seenMap.get(v.id) ?? 0;
                  const unread = activity > seen;
                  return (
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 800 }}>{v.title}</div>
                      <div className="row" style={{ alignItems: "center" }}>
                        {unread ? <div className="pill">UNREAD</div> : null}
                        {v.is_library ? <div className="pill">LIBRARY</div> : null}
                        <div className="pill">PINNED</div>
                        <div className="pill">{String(v.category).toUpperCase()}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Visible to: {v.is_library ? "Team" : "You + your coach"}
                </div>
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  <LocalDateTime value={v.created_at} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {rest && rest.length > 0 ? (
        <div className="stack">
          {rest.map((v: any) => {
            const ts = sort === "activity" ? v.last_activity_at ?? v.created_at : v.created_at;
            const isNew = lastSeen > 0 && new Date(ts).getTime() > lastSeen;
            const activity = new Date(v.last_activity_at ?? v.created_at).getTime();
            const seen = seenMap.get(v.id) ?? 0;
            const unread = activity > seen;
            return (
              <Link key={v.id} href={`/app/videos/${v.id}`}>
                <div className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{v.title}</div>
                    <div className="row" style={{ alignItems: "center" }}>
                      {unread ? <div className="pill">UNREAD</div> : null}
                      {isNew ? <div className="pill">NEW</div> : null}
                      {v.is_library ? <div className="pill">LIBRARY</div> : null}
                      <div className="pill">{String(v.category).toUpperCase()}</div>
                    </div>
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Visible to: {v.is_library ? "Team" : "You + your coach"}
                  </div>
                  <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    <LocalDateTime value={v.created_at} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <div style={{ fontWeight: 800 }}>No videos yet</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Upload your first Game or Training clip.
          </div>
          <div style={{ marginTop: 12 }}>
            <LinkButton href="/app/upload" variant="primary">
              Upload
            </LinkButton>
          </div>
        </Card>
      )}
    </div>
  );
}

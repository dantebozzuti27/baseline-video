import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalDateTime } from "@/components/LocalDateTime";
import { EmptyState } from "@/components/EmptyState";
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

  const playerMode = ((profile as any)?.player_mode ?? "in_person") as "in_person" | "hybrid" | "remote";

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
    .select("id, title, category, created_at, pinned, is_library, last_activity_at, owner_user_id")
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

  // Calculate player stats
  const myVideos = (videos ?? []).filter((v: any) => v.owner_user_id === profile.user_id);
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);
  const thisWeekVideos = myVideos.filter((v: any) => new Date(v.created_at) >= thisWeekStart);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekVideos = myVideos.filter(
    (v: any) => new Date(v.created_at) >= lastWeekStart && new Date(v.created_at) < thisWeekStart
  );

  return (
    <div className="stack">
      <FeedClient />

      {/* Player Stats Cards */}
      <div className="bvStatsRow">
        <div className="bvStatCard">
          <div className="bvStatValue">{thisWeekVideos.length}</div>
          <div className="bvStatLabel">This week</div>
        </div>
        <div className="bvStatCard">
          <div className="bvStatValue">{lastWeekVideos.length}</div>
          <div className="bvStatLabel">Last week</div>
        </div>
        <div className="bvStatCard">
          <div className="bvStatValue">{myVideos.length}</div>
          <div className="bvStatLabel">Total uploads</div>
        </div>
      </div>

      <Card>
        <div style={{ fontWeight: 900 }}>Your next rep</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          {playerMode === "remote" ? (
            <>Remote: aim for consistency — same angle, same reps, every week.</>
          ) : playerMode === "hybrid" ? (
            <>Hybrid: upload one drill clip and one swing clip to stay on track.</>
          ) : (
            <>In-person: upload your best rep today, then add one quick note.</>
          )}
        </div>
        {thisWeekVideos.length >= 3 && (
          <div className="pill pillSuccess" style={{ marginTop: 10 }}>
            ✓ Great pace this week!
          </div>
        )}
      </Card>

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
          <div className="stack bvStagger">
            {pinned.map((v: any) => {
              const activity = new Date(v.last_activity_at ?? v.created_at).getTime();
              const seen = seenMap.get(v.id) ?? 0;
              const unread = activity > seen;
              const badge = v.is_library ? "LIBRARY" : v.owner_user_id === profile.user_id ? "PRIVATE" : "COACH-SHARED";
              return (
                <Link key={v.id} href={`/app/videos/${v.id}`}>
                  <div className="card cardInteractive">
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 800 }}>{v.title}</div>
                      <div className="row" style={{ alignItems: "center", gap: 6 }}>
                        {unread && <div className="pill pillDanger">UNREAD</div>}
                        <div className={badge === "LIBRARY" ? "pill pillInfo" : "pill"}>{badge}</div>
                        <div className="pill pillWarning">PINNED</div>
                        <div className="pill">{String(v.category).toUpperCase()}</div>
                      </div>
                    </div>
                    <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                      <LocalDateTime value={v.created_at} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {rest && rest.length > 0 ? (
        <div className="stack bvStagger">
          {rest.map((v: any) => {
            const ts = sort === "activity" ? v.last_activity_at ?? v.created_at : v.created_at;
            const isNew = lastSeen > 0 && new Date(ts).getTime() > lastSeen;
            const activity = new Date(v.last_activity_at ?? v.created_at).getTime();
            const seen = seenMap.get(v.id) ?? 0;
            const unread = activity > seen;
            const badge = v.is_library ? "LIBRARY" : v.owner_user_id === profile.user_id ? "PRIVATE" : "COACH-SHARED";
            return (
              <Link key={v.id} href={`/app/videos/${v.id}`}>
                <div className="card cardInteractive">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{v.title}</div>
                    <div className="row" style={{ alignItems: "center", gap: 6 }}>
                      {unread && <div className="pill pillDanger">UNREAD</div>}
                      {isNew && <div className="pill pillSuccess">NEW</div>}
                      <div className={badge === "LIBRARY" ? "pill pillInfo" : badge === "COACH-SHARED" ? "pill pillWarning" : "pill"}>{badge}</div>
                      <div className="pill">{String(v.category).toUpperCase()}</div>
                    </div>
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
        <EmptyState
          variant="videos"
          title="No videos yet"
          message={playerMode === "remote"
            ? "Start with a short training clip from a consistent angle."
            : playerMode === "hybrid"
              ? "Start with one drill clip and one swing clip."
              : "Upload your first Game or Training clip."
          }
          actionLabel="Upload video"
          actionHref="/app/upload"
        />
      )}
    </div>
  );
}

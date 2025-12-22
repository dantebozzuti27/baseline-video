import Link from "next/link";
import { redirect } from "next/navigation";
import AccessCodeCard from "./AccessCodeCard";
import { LinkButton, Card } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { displayNameFromProfile } from "@/lib/utils/name";
import { LocalDateTime } from "@/components/LocalDateTime";

export default async function DashboardPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");

  const supabase = createSupabaseServerClient();

  const { data: players } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, role")
    .eq("team_id", profile.team_id)
    .eq("role", "player")
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  // "Needs feedback" = recent team videos with zero comments (fast heuristic)
  const { data: recentTeamVideos } = await supabase
    .from("videos")
    .select("id, title, owner_user_id, created_at, last_activity_at")
    .eq("team_id", profile.team_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const videoIds = (recentTeamVideos ?? []).map((v: any) => v.id);
  const { data: comments } = videoIds.length
    ? await supabase.from("comments").select("video_id").in("video_id", videoIds).is("deleted_at", null)
    : { data: [] as any[] };

  const commented = new Set((comments ?? []).map((c: any) => c.video_id));
  const pendingAll = (recentTeamVideos ?? []).filter((v: any) => !commented.has(v.id));
  const pendingOldest = [...pendingAll]
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(0, 10);

  const awaitingCounts = new Map<string, { count: number; oldestAt: string | null }>();
  for (const v of pendingAll as any[]) {
    const prev = awaitingCounts.get(v.owner_user_id) ?? { count: 0, oldestAt: null };
    const oldestAt =
      !prev.oldestAt || new Date(v.created_at).getTime() < new Date(prev.oldestAt).getTime() ? v.created_at : prev.oldestAt;
    awaitingCounts.set(v.owner_user_id, { count: prev.count + 1, oldestAt });
  }

  // True unread for coach: unread if last_activity_at > last_seen_at (per video_views).
  const { data: coachViews } = videoIds.length
    ? await supabase.from("video_views").select("video_id, last_seen_at").in("video_id", videoIds)
    : { data: [] as any[] };
  const coachSeenMap = new Map<string, number>();
  for (const vv of coachViews ?? []) coachSeenMap.set(vv.video_id, new Date(vv.last_seen_at).getTime());
  const unreadCounts = new Map<string, number>();
  for (const v of recentTeamVideos ?? []) {
    const activity = new Date((v as any).last_activity_at ?? v.created_at).getTime();
    const seen = coachSeenMap.get((v as any).id) ?? 0;
    if (activity > seen) {
      unreadCounts.set((v as any).owner_user_id, (unreadCounts.get((v as any).owner_user_id) ?? 0) + 1);
    }
  }

  const ownerIds = Array.from(new Set((pendingOldest ?? []).map((v: any) => v.owner_user_id)));
  const { data: owners } = ownerIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name")
        .in("user_id", ownerIds)
    : { data: [] as any[] };
  const ownerMap = new Map<string, any>();
  for (const o of owners ?? []) ownerMap.set(o.user_id, o);

  // Recent uploads per player (last 7 days)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentVideos } = await supabase
    .from("videos")
    .select("owner_user_id, created_at")
    .eq("team_id", profile.team_id)
    .gte("created_at", since);

  const counts = new Map<string, number>();
  for (const v of recentVideos ?? []) {
    counts.set(v.owner_user_id, (counts.get(v.owner_user_id) ?? 0) + 1);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Coach dashboard</div>
          <div className="muted" style={{ marginTop: 6 }}>
            Triage first, then drill into players.
          </div>
        </div>
        <LinkButton href="/upload" variant="primary">
          Upload
        </LinkButton>
      </div>

      <AccessCodeCard />

      <Card>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Needs feedback</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              Oldest pending videos (no comments yet).
            </div>
          </div>
          <div className="pill">{pendingAll.length}</div>
        </div>

        {pendingOldest.length > 0 ? (
          <div className="stack" style={{ marginTop: 12 }}>
            {pendingOldest.map((v: any) => {
              const owner = ownerMap.get(v.owner_user_id);
              return (
                <Link key={v.id} href={`/videos/${v.id}`}>
                  <div className="card">
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{v.title}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                          {owner ? `Player: ${displayNameFromProfile(owner)}` : null}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        <LocalDateTime value={v.created_at} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 12 }}>
            You’re caught up.
          </div>
        )}
      </Card>

      <Card>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Players</div>
        {players && players.length > 0 ? (
          <div className="stack">
            {players.map((p) => (
              <Link key={p.user_id} href={`/player/${p.user_id}`}>
                <div className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{displayNameFromProfile(p as any)}</div>
                    <div className="row" style={{ alignItems: "center" }}>
                      {(unreadCounts.get(p.user_id) ?? 0) > 0 ? (
                        <div className="pill">{unreadCounts.get(p.user_id) ?? 0} unread</div>
                      ) : null}
                      {(awaitingCounts.get(p.user_id)?.count ?? 0) > 0 ? (
                        <div className="pill">{awaitingCounts.get(p.user_id)?.count ?? 0} awaiting</div>
                      ) : null}
                      <div className="pill">{counts.get(p.user_id) ?? 0} recent</div>
                    </div>
                  </div>
                  {(awaitingCounts.get(p.user_id)?.count ?? 0) > 0 && awaitingCounts.get(p.user_id)?.oldestAt ? (
                    <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                      Oldest awaiting: <LocalDateTime value={awaitingCounts.get(p.user_id)?.oldestAt as string} />
                    </div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="muted">No players yet. Share your access code so they can join.</div>
        )}
      </Card>

      <div className="row">
        <LinkButton href="/settings">Team settings</LinkButton>
      </div>
    </div>
  );
}

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
    .select("id, title, owner_user_id, created_at")
    .eq("team_id", profile.team_id)
    .order("created_at", { ascending: false })
    .limit(25);

  const videoIds = (recentTeamVideos ?? []).map((v: any) => v.id);
  const { data: comments } = videoIds.length
    ? await supabase.from("comments").select("video_id").in("video_id", videoIds)
    : { data: [] as any[] };

  const commented = new Set((comments ?? []).map((c: any) => c.video_id));
  const needsFeedback = (recentTeamVideos ?? []).filter((v: any) => !commented.has(v.id)).slice(0, 10);

  const ownerIds = Array.from(new Set((needsFeedback ?? []).map((v: any) => v.owner_user_id)));
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
        <LinkButton href="/app/upload" variant="primary">
          Upload
        </LinkButton>
      </div>

      <AccessCodeCard />

      <Card>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Needs feedback</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              Recent videos with no comments yet.
            </div>
          </div>
          <div className="pill">{needsFeedback.length}</div>
        </div>

        {needsFeedback.length > 0 ? (
          <div className="stack" style={{ marginTop: 12 }}>
            {needsFeedback.map((v: any) => {
              const owner = ownerMap.get(v.owner_user_id);
              return (
                <Link key={v.id} href={`/app/videos/${v.id}`}>
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
              <Link key={p.user_id} href={`/app/player/${p.user_id}`}>
                <div className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{displayNameFromProfile(p as any)}</div>
                    <div className="pill">{counts.get(p.user_id) ?? 0} recent</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="muted">No players yet. Share your access code so they can join.</div>
        )}
      </Card>

      <div className="row">
        <LinkButton href="/app/audit">Audit log</LinkButton>
        <LinkButton href="/app/settings">Team settings</LinkButton>
      </div>
    </div>
  );
}

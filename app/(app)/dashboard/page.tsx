import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/auth/profile";
import { Button, Card } from "@/components/ui";
import AccessCodeCard from "./AccessCodeCard";

export default async function DashboardPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "coach") redirect("/app");

  const supabase = createSupabaseServerClient();

  const { data: players } = await supabase
    .from("profiles")
    .select("user_id, display_name, role")
    .eq("team_id", profile.team_id)
    .eq("role", "player")
    .order("display_name", { ascending: true });

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
            Players and recent uploads (last 7 days).
          </div>
        </div>
        <Link href="/app/upload">
          <Button variant="primary">Upload</Button>
        </Link>
      </div>
      <AccessCodeCard />

      <Card>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Players</div>
        {players && players.length > 0 ? (
          <div className="stack">
            {players.map((p) => (
              <Link key={p.user_id} href={`/app/player/${p.user_id}`}>
                <div className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{p.display_name}</div>
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
    </div>
  );
}



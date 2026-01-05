import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card } from "@/components/ui";
import AdminNav from "../AdminNav";

export const dynamic = "force-dynamic";

async function getBusinessMetrics() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().split("T")[0];

  const [
    allProfiles,
    allTeams,
    allVideos,
    allLessons,
    signups30d,
    signups7d
  ] = await Promise.all([
    admin.from("profiles").select("user_id, role, created_at, is_active, team_id"),
    admin.from("teams").select("id, created_at"),
    admin.from("videos").select("id, created_at"),
    admin.from("lessons").select("id, created_at, status"),
    admin
      .from("analytics_events")
      .select("user_id, created_at, metadata")
      .eq("event_type", "sign_up")
      .gte("created_at", thirtyDaysAgo),
    admin
      .from("analytics_events")
      .select("user_id, created_at, metadata")
      .eq("event_type", "sign_up")
      .gte("created_at", sevenDaysAgo)
  ]);

  const profiles = allProfiles.data || [];
  const teams = allTeams.data || [];
  const videos = allVideos.data || [];
  const lessons = allLessons.data || [];
  const signupsLast30 = signups30d.data || [];
  const signupsLast7 = signups7d.data || [];

  // Calculate signups by day (last 30 days)
  const signupsByDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    signupsByDay[d.toISOString().split("T")[0]] = 0;
  }
  signupsLast30.forEach((s: any) => {
    const day = s.created_at.split("T")[0];
    if (signupsByDay[day] !== undefined) {
      signupsByDay[day]++;
    }
  });

  // Calculate coach vs player breakdown
  const coaches = profiles.filter((p: any) => p.role === "coach");
  const players = profiles.filter((p: any) => p.role === "player");
  const activePlayers = players.filter((p: any) => p.is_active !== false);
  const inactivePlayers = players.filter((p: any) => p.is_active === false);

  // Calculate average players per team
  const teamPlayerCounts: Record<string, number> = {};
  players.forEach((p: any) => {
    if (p.team_id) {
      teamPlayerCounts[p.team_id] = (teamPlayerCounts[p.team_id] || 0) + 1;
    }
  });
  const avgPlayersPerTeam =
    Object.keys(teamPlayerCounts).length > 0
      ? (Object.values(teamPlayerCounts).reduce((a, b) => a + b, 0) / Object.keys(teamPlayerCounts).length).toFixed(1)
      : "0";

  // Calculate videos and lessons stats
  const videosLast30 = videos.filter((v: any) => new Date(v.created_at) >= new Date(thirtyDaysAgo)).length;
  const lessonsApproved = lessons.filter((l: any) => l.status === "approved").length;
  const lessonsPending = lessons.filter((l: any) => l.status === "requested").length;

  return {
    totalUsers: profiles.length,
    totalCoaches: coaches.length,
    totalPlayers: players.length,
    activePlayers: activePlayers.length,
    inactivePlayers: inactivePlayers.length,
    totalTeams: teams.length,
    avgPlayersPerTeam,
    totalVideos: videos.length,
    videosLast30,
    totalLessons: lessons.length,
    lessonsApproved,
    lessonsPending,
    signups30d: signupsLast30.length,
    signups7d: signupsLast7.length,
    signupsByDay: Object.entries(signupsByDay).map(([date, count]) => ({ date, count }))
  };
}

function LineChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 600;
  const height = 100;
  const padding = 20;

  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.count / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }}>
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  subtext
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <Card className="cardInteractive">
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{value}</div>
      {subtext && (
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          {subtext}
        </div>
      )}
    </Card>
  );
}

export default async function AdminBusinessPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const metrics = await getBusinessMetrics();

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Business" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Business Metrics</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Track signups, retention, and growth.
        </div>
      </div>

      <AdminNav />

      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Signups (Last 30 Days)</div>
        </div>
        <div style={{ marginTop: 16, overflowX: "auto" }}>
          <LineChart data={metrics.signupsByDay} />
        </div>
        <div className="row" style={{ gap: 24, marginTop: 16 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Last 7 days
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{metrics.signups7d}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Last 30 days
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{metrics.signups30d}</div>
          </div>
        </div>
      </Card>

      <div className="cardHeader" style={{ marginTop: 8 }}>
        <div className="cardTitle">Users</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <MetricCard label="Total Users" value={metrics.totalUsers} />
        <MetricCard label="Coaches" value={metrics.totalCoaches} />
        <MetricCard label="Players" value={metrics.totalPlayers} />
        <MetricCard
          label="Active Players"
          value={metrics.activePlayers}
          subtext={`${metrics.inactivePlayers} inactive`}
        />
      </div>

      <div className="cardHeader" style={{ marginTop: 8 }}>
        <div className="cardTitle">Teams</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <MetricCard label="Total Teams" value={metrics.totalTeams} />
        <MetricCard label="Avg Players/Team" value={metrics.avgPlayersPerTeam} />
      </div>

      <div className="cardHeader" style={{ marginTop: 8 }}>
        <div className="cardTitle">Content</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        <MetricCard label="Total Videos" value={metrics.totalVideos} subtext={`${metrics.videosLast30} last 30d`} />
        <MetricCard
          label="Total Lessons"
          value={metrics.totalLessons}
          subtext={`${metrics.lessonsApproved} approved, ${metrics.lessonsPending} pending`}
        />
      </div>
    </div>
  );
}


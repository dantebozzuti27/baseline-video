import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Card, Pill } from "@/components/ui";
import AdminNav from "../AdminNav";
import { DataTable } from "@/components/DataTable";
import { Trophy, Users, Video, Calendar, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

async function getTeamsData() {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get all teams
  const { data: teams } = await admin
    .from("teams")
    .select("id, name, created_at");

  // Get all profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, team_id, role, is_active, created_at");

  // Get all videos
  const { data: videos } = await admin
    .from("videos")
    .select("id, team_id, created_at");

  // Get all comments
  const { data: comments } = await admin
    .from("comments")
    .select("id, user_id, video_id, created_at");

  // Get all lessons
  const { data: lessons } = await admin
    .from("lessons")
    .select("id, coach_user_id, status, created_at");

  // Build team stats
  const teamStats = (teams || []).map((team: any) => {
    const teamProfiles = (profiles || []).filter((p: any) => p.team_id === team.id);
    const coach = teamProfiles.find((p: any) => p.role === "coach");
    const players = teamProfiles.filter((p: any) => p.role === "player");
    const activePlayers = players.filter((p: any) => p.is_active);

    const teamVideos = (videos || []).filter((v: any) => v.team_id === team.id);
    const recentVideos = teamVideos.filter((v: any) => v.created_at >= sevenDaysAgo);

    // Comments from team members
    const teamUserIds = teamProfiles.map((p: any) => p.user_id);
    const teamComments = (comments || []).filter((c: any) => teamUserIds.includes(c.user_id));
    const recentComments = teamComments.filter((c: any) => c.created_at >= sevenDaysAgo);

    // Lessons by the coach
    const coachLessons = coach
      ? (lessons || []).filter((l: any) => l.coach_user_id === coach.user_id)
      : [];
    const completedLessons = coachLessons.filter((l: any) => l.status === "completed" || l.status === "approved");

    // Calculate engagement score (weighted combination of activity)
    const engagementScore = Math.round(
      (recentVideos.length * 10) +
      (recentComments.length * 5) +
      (activePlayers.length * 15)
    );

    return {
      id: team.id,
      name: team.name,
      created_at: team.created_at,
      coachName: coach ? "Active" : "No coach",
      totalPlayers: players.length,
      activePlayers: activePlayers.length,
      totalVideos: teamVideos.length,
      videosThisWeek: recentVideos.length,
      totalComments: teamComments.length,
      commentsThisWeek: recentComments.length,
      totalLessons: coachLessons.length,
      completedLessons: completedLessons.length,
      engagementScore
    };
  });

  // Sort by engagement score
  teamStats.sort((a, b) => b.engagementScore - a.engagementScore);

  // Get coach effectiveness data
  const coachStats = (profiles || [])
    .filter((p: any) => p.role === "coach")
    .map((coach: any) => {
      const team = (teams || []).find((t: any) => t.id === coach.team_id);
      const teamProfiles = (profiles || []).filter((p: any) => 
        p.team_id === coach.team_id && p.role === "player"
      );
      const activePlayers = teamProfiles.filter((p: any) => p.is_active);

      const coachLessons = (lessons || []).filter((l: any) => l.coach_user_id === coach.user_id);
      const approvedLessons = coachLessons.filter((l: any) => l.status === "approved" || l.status === "completed");

      // Get videos from coach's players
      const playerIds = teamProfiles.map((p: any) => p.user_id);
      const teamVideos = (videos || []).filter((v: any) => v.team_id === coach.team_id);
      const recentVideos = teamVideos.filter((v: any) => v.created_at >= thirtyDaysAgo);

      // Comments made by coach
      const coachComments = (comments || []).filter((c: any) => c.user_id === coach.user_id);
      const recentComments = coachComments.filter((c: any) => c.created_at >= thirtyDaysAgo);

      // Player retention (active / total)
      const retentionRate = teamProfiles.length > 0
        ? Math.round((activePlayers.length / teamProfiles.length) * 100)
        : 0;

      return {
        id: coach.user_id,
        teamName: team?.name || "Unknown",
        totalPlayers: teamProfiles.length,
        activePlayers: activePlayers.length,
        retentionRate,
        totalLessons: coachLessons.length,
        lessonApprovalRate: coachLessons.length > 0
          ? Math.round((approvedLessons.length / coachLessons.length) * 100)
          : 0,
        feedbackGiven: coachComments.length,
        feedbackThisMonth: recentComments.length,
        uploadsThisMonth: recentVideos.length
      };
    })
    .sort((a, b) => b.retentionRate - a.retentionRate);

  return {
    teams: teamStats,
    coaches: coachStats,
    summary: {
      totalTeams: teams?.length || 0,
      totalPlayers: (profiles || []).filter((p: any) => p.role === "player").length,
      activePlayers: (profiles || []).filter((p: any) => p.role === "player" && p.is_active).length,
      totalCoaches: (profiles || []).filter((p: any) => p.role === "coach").length
    }
  };
}

export default async function AdminTeamsPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/app/dashboard");

  const data = await getTeamsData();

  const teamColumns = [
    { key: "name", header: "Team", width: "150px" },
    { 
      key: "engagementScore", 
      header: "Score", 
      width: "80px",
      render: (row: any) => (
        <span style={{ fontWeight: 700, color: row.engagementScore > 50 ? "var(--success, #4ade80)" : "inherit" }}>
          {row.engagementScore}
        </span>
      )
    },
    { key: "activePlayers", header: "Active", width: "70px" },
    { key: "totalPlayers", header: "Total", width: "70px" },
    { key: "videosThisWeek", header: "Videos (7d)", width: "100px" },
    { key: "commentsThisWeek", header: "Comments (7d)", width: "110px" },
    { key: "totalLessons", header: "Lessons", width: "80px" }
  ];

  const coachColumns = [
    { key: "teamName", header: "Team", width: "150px" },
    { 
      key: "retentionRate", 
      header: "Retention", 
      width: "100px",
      render: (row: any) => (
        <Pill variant={row.retentionRate >= 80 ? "success" : row.retentionRate >= 50 ? "warning" : "danger"}>
          {row.retentionRate}%
        </Pill>
      )
    },
    { key: "activePlayers", header: "Active", width: "70px" },
    { key: "totalPlayers", header: "Total", width: "70px" },
    { key: "feedbackThisMonth", header: "Feedback (30d)", width: "120px" },
    { 
      key: "lessonApprovalRate", 
      header: "Lesson %", 
      width: "90px",
      render: (row: any) => `${row.lessonApprovalRate}%`
    }
  ];

  return (
    <div className="stack">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Admin", href: "/app/admin" },
          { label: "Teams" }
        ]}
      />

      <div>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Teams & Coaches</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Team leaderboard and coach effectiveness metrics.
        </div>
      </div>

      <AdminNav />

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Trophy size={16} color="var(--primary)" />
            <span className="muted" style={{ fontSize: 12 }}>Teams</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.summary.totalTeams}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Users size={16} color="var(--primary)" />
            <span className="muted" style={{ fontSize: 12 }}>Coaches</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.summary.totalCoaches}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Users size={16} color="var(--success, #4ade80)" />
            <span className="muted" style={{ fontSize: 12 }}>Active Players</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{data.summary.activePlayers}</div>
          <div className="muted" style={{ fontSize: 11 }}>of {data.summary.totalPlayers} total</div>
        </Card>
      </div>

      {/* Team Leaderboard */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Team Leaderboard</div>
          <div className="cardSubtitle">Ranked by engagement score (videos × 10 + comments × 5 + active players × 15)</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <DataTable
            data={data.teams}
            columns={teamColumns}
            pageSize={25}
            searchable={true}
            searchKeys={["name"]}
            exportFilename="teams-leaderboard"
            emptyMessage="No teams yet"
          />
        </div>
      </Card>

      {/* Coach Effectiveness */}
      <Card>
        <div className="cardHeader">
          <div className="cardTitle">Coach Effectiveness</div>
          <div className="cardSubtitle">Player retention, feedback, and lesson metrics</div>
        </div>
        <div style={{ marginTop: 16 }}>
          <DataTable
            data={data.coaches}
            columns={coachColumns}
            pageSize={25}
            searchable={true}
            searchKeys={["teamName"]}
            exportFilename="coach-effectiveness"
            emptyMessage="No coaches yet"
          />
        </div>
      </Card>
    </div>
  );
}


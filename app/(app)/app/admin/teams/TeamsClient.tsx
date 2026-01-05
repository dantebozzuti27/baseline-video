"use client";

import { Card, Pill } from "@/components/ui";
import { DataTable } from "@/components/DataTable";
import { Trophy, Users } from "lucide-react";

type TeamStats = {
  id: string;
  name: string;
  engagementScore: number;
  activePlayers: number;
  totalPlayers: number;
  videosThisWeek: number;
  commentsThisWeek: number;
  totalLessons: number;
};

type CoachStats = {
  id: string;
  teamName: string;
  retentionRate: number;
  activePlayers: number;
  totalPlayers: number;
  feedbackThisMonth: number;
  lessonApprovalRate: number;
};

type Props = {
  teams: TeamStats[];
  coaches: CoachStats[];
  summary: {
    totalTeams: number;
    totalPlayers: number;
    activePlayers: number;
    totalCoaches: number;
  };
};

export default function TeamsClient({ teams, coaches, summary }: Props) {
  const teamColumns = [
    { key: "name", header: "Team", width: "150px" },
    {
      key: "engagementScore",
      header: "Score",
      width: "80px",
      render: (row: TeamStats) => (
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
      render: (row: CoachStats) => (
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
      render: (row: CoachStats) => `${row.lessonApprovalRate}%`
    }
  ];

  return (
    <>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <Card className="cardInteractive">
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Trophy size={16} color="var(--primary)" />
            <span className="muted" style={{ fontSize: 12 }}>Teams</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary.totalTeams}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Users size={16} color="var(--primary)" />
            <span className="muted" style={{ fontSize: 12 }}>Coaches</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary.totalCoaches}</div>
        </Card>
        <Card className="cardInteractive">
          <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Users size={16} color="var(--success, #4ade80)" />
            <span className="muted" style={{ fontSize: 12 }}>Active Players</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{summary.activePlayers}</div>
          <div className="muted" style={{ fontSize: 11 }}>of {summary.totalPlayers} total</div>
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
            data={teams}
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
            data={coaches}
            columns={coachColumns}
            pageSize={25}
            searchable={true}
            searchKeys={["teamName"]}
            exportFilename="coach-effectiveness"
            emptyMessage="No coaches yet"
          />
        </div>
      </Card>
    </>
  );
}


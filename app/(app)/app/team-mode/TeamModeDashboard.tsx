"use client";

import * as React from "react";
import Link from "next/link";
import {
  Upload,
  FileSpreadsheet,
  Lightbulb,
  FileText,
  Users,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  Plus,
} from "lucide-react";

type Player = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
} | null;

type FileRecord = {
  id: string;
  file_name: string;
  is_opponent_data: boolean;
  opponent_name: string | null;
  processing_status: string;
  row_count: number;
  created_at: string;
  player: Player;
};

type Insight = {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  confidence_score: number;
  is_opponent_insight: boolean;
  opponent_name: string | null;
  created_at: string;
  player: Player;
};

type Report = {
  id: string;
  title: string;
  report_category: string;
  report_type: string;
  status: string;
  game_date: string | null;
  shared_with_player: boolean;
  created_at: string;
  player: Player;
};

type Stats = {
  totalFiles: number;
  ownTeamFiles: number;
  opponentFiles: number;
  activeInsights: number;
  totalReports: number;
  ownTeamReports: number;
  opponentReports: number;
  opponentsScouted: number;
};

type Props = {
  isCoach: boolean;
  stats: Stats;
  recentFiles: FileRecord[];
  recentInsights: Insight[];
  recentReports: Report[];
};

type Tab = "overview" | "team" | "opponents" | "insights" | "reports";

export default function TeamModeDashboard({
  isCoach,
  stats,
  recentFiles,
  recentInsights,
  recentReports,
}: Props) {
  const [activeTab, setActiveTab] = React.useState<Tab>("overview");

  const getPlayerName = (player: Player) => {
    if (!player) return "Unknown";
    return (
      player.display_name ||
      [player.first_name, player.last_name].filter(Boolean).join(" ") ||
      "Unknown"
    );
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "strength":
        return <TrendingUp size={16} className="bvInsightStrength" />;
      case "weakness":
        return <TrendingDown size={16} className="bvInsightWeakness" />;
      case "trend":
        return <TrendingUp size={16} className="bvInsightTrend" />;
      case "recommendation":
        return <Lightbulb size={16} className="bvInsightRecommendation" />;
      case "tendency":
        return <Target size={16} className="bvInsightTendency" />;
      case "alert":
        return <AlertCircle size={16} className="bvInsightAlert" />;
      default:
        return <Lightbulb size={16} />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 size={14} className="bvStatusCompleted" />;
      case "processing":
        return <Loader2 size={14} className="bvStatusProcessing bvSpinner" />;
      case "failed":
        return <XCircle size={14} className="bvStatusFailed" />;
      default:
        return <Clock size={14} className="bvStatusPending" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "team", label: "My Team Data" },
    { id: "opponents", label: "Opponent Data" },
    { id: "insights", label: "Insights" },
    { id: "reports", label: "Reports" },
  ];

  return (
    <div className="bvTeamMode">
      {/* Header */}
      <div className="bvTeamModeHeader">
        <div>
          <h1>Team Mode Analytics</h1>
          <p className="bvMuted">AI-powered performance insights and scouting</p>
        </div>
        {isCoach && (
          <div className="bvHeaderActions">
            <Link href="/app/team-mode/upload" className="btn btnPrimary">
              <Upload size={18} />
              Upload Data
            </Link>
            <Link href="/app/team-mode/reports/new" className="btn btnSecondary">
              <Plus size={18} />
              New Report
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bvTabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`bvTab ${activeTab === tab.id ? "bvTabActive" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bvTabContent">
        {activeTab === "overview" && (
          <div className="bvOverview bvAnimFadeIn">
            {/* Stats Grid */}
            <div className="bvStatsGrid">
              <div className="bvStatCard">
                <div className="bvStatIcon">
                  <FileSpreadsheet size={24} />
                </div>
                <div className="bvStatContent">
                  <span className="bvStatValue">{stats.totalFiles}</span>
                  <span className="bvStatLabel">Data Files</span>
                  <span className="bvStatDetail">
                    {stats.ownTeamFiles} team, {stats.opponentFiles} opponent
                  </span>
                </div>
              </div>

              <div className="bvStatCard">
                <div className="bvStatIcon">
                  <Lightbulb size={24} />
                </div>
                <div className="bvStatContent">
                  <span className="bvStatValue">{stats.activeInsights}</span>
                  <span className="bvStatLabel">Active Insights</span>
                  <span className="bvStatDetail">AI-generated findings</span>
                </div>
              </div>

              <div className="bvStatCard">
                <div className="bvStatIcon">
                  <FileText size={24} />
                </div>
                <div className="bvStatContent">
                  <span className="bvStatValue">{stats.totalReports}</span>
                  <span className="bvStatLabel">Scouting Reports</span>
                  <span className="bvStatDetail">
                    {stats.ownTeamReports} team, {stats.opponentReports} opponent
                  </span>
                </div>
              </div>

              <div className="bvStatCard">
                <div className="bvStatIcon">
                  <Users size={24} />
                </div>
                <div className="bvStatContent">
                  <span className="bvStatValue">{stats.opponentsScouted}</span>
                  <span className="bvStatLabel">Opponents Scouted</span>
                  <span className="bvStatDetail">Teams and players</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bvRecentSection">
              <h2>Recent Insights</h2>
              {recentInsights.length === 0 ? (
                <div className="bvEmptyState">
                  <Lightbulb size={32} />
                  <p>No insights yet. Upload performance data to generate AI insights.</p>
                  {isCoach && (
                    <Link href="/app/team-mode/upload" className="btn btnPrimary">
                      Upload Data
                    </Link>
                  )}
                </div>
              ) : (
                <div className="bvInsightsList">
                  {recentInsights.slice(0, 5).map((insight) => (
                    <div key={insight.id} className="bvInsightCard">
                      <div className="bvInsightHeader">
                        {getInsightIcon(insight.insight_type)}
                        <span
                          className={`bvInsightType bvInsightType-${insight.insight_type}`}
                        >
                          {insight.insight_type}
                        </span>
                        <span
                          className={`bvCategoryBadge ${insight.is_opponent_insight ? "bvOpponent" : "bvOwnTeam"}`}
                        >
                          {insight.is_opponent_insight
                            ? insight.opponent_name || "Opponent"
                            : getPlayerName(insight.player)}
                        </span>
                      </div>
                      <h3>{insight.title}</h3>
                      <p>{insight.description}</p>
                      <div className="bvInsightMeta">
                        <span className="bvConfidence">
                          {Math.round(insight.confidence_score * 100)}% confidence
                        </span>
                        <span className="bvDate">{formatDate(insight.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            {isCoach && (
              <div className="bvQuickActions">
                <h2>Quick Actions</h2>
                <div className="bvActionGrid">
                  <Link href="/app/team-mode/upload?category=own_team" className="bvActionCard">
                    <Upload size={20} />
                    <span>Upload Team Data</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link href="/app/team-mode/upload?category=opponent" className="bvActionCard">
                    <Users size={20} />
                    <span>Upload Opponent Data</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link href="/app/team-mode/reports/new?type=player_assessment" className="bvActionCard">
                    <FileText size={20} />
                    <span>Create Player Report</span>
                    <ChevronRight size={16} />
                  </Link>
                  <Link href="/app/team-mode/reports/new?type=opponent_player" className="bvActionCard">
                    <Target size={20} />
                    <span>Create Opponent Report</span>
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "team" && (
          <div className="bvFilesTab bvAnimFadeIn">
            <div className="bvTabHeader">
              <h2>My Team Performance Data</h2>
              {isCoach && (
                <Link href="/app/team-mode/upload?category=own_team" className="btn btnPrimary">
                  <Upload size={16} />
                  Upload
                </Link>
              )}
            </div>
            {recentFiles.filter((f) => !f.is_opponent_data).length === 0 ? (
              <div className="bvEmptyState">
                <FileSpreadsheet size={32} />
                <p>No team data uploaded yet</p>
                {isCoach && (
                  <Link href="/app/team-mode/upload?category=own_team" className="btn btnPrimary">
                    Upload Data
                  </Link>
                )}
              </div>
            ) : (
              <div className="bvFilesTable">
                <table>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>File Name</th>
                      <th>Rows</th>
                      <th>Status</th>
                      <th>Uploaded</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFiles
                      .filter((f) => !f.is_opponent_data)
                      .map((file) => (
                        <tr key={file.id}>
                          <td>{getPlayerName(file.player)}</td>
                          <td>{file.file_name}</td>
                          <td>{file.row_count}</td>
                          <td>
                            <span className="bvStatusBadge">
                              {getStatusIcon(file.processing_status)}
                              {file.processing_status}
                            </span>
                          </td>
                          <td>{formatDate(file.created_at)}</td>
                          <td>
                            <Link
                              href={`/app/team-mode/files/${file.id}`}
                              className="btn btnSecondary btnSmall"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "opponents" && (
          <div className="bvFilesTab bvAnimFadeIn">
            <div className="bvTabHeader">
              <h2>Opponent Scouting Data</h2>
              {isCoach && (
                <Link href="/app/team-mode/upload?category=opponent" className="btn btnPrimary">
                  <Upload size={16} />
                  Upload
                </Link>
              )}
            </div>
            {recentFiles.filter((f) => f.is_opponent_data).length === 0 ? (
              <div className="bvEmptyState">
                <Users size={32} />
                <p>No opponent data uploaded yet</p>
                {isCoach && (
                  <Link href="/app/team-mode/upload?category=opponent" className="btn btnPrimary">
                    Upload Data
                  </Link>
                )}
              </div>
            ) : (
              <div className="bvFilesTable">
                <table>
                  <thead>
                    <tr>
                      <th>Opponent</th>
                      <th>File Name</th>
                      <th>Rows</th>
                      <th>Status</th>
                      <th>Uploaded</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFiles
                      .filter((f) => f.is_opponent_data)
                      .map((file) => (
                        <tr key={file.id}>
                          <td>{file.opponent_name || "Unknown"}</td>
                          <td>{file.file_name}</td>
                          <td>{file.row_count}</td>
                          <td>
                            <span className="bvStatusBadge">
                              {getStatusIcon(file.processing_status)}
                              {file.processing_status}
                            </span>
                          </td>
                          <td>{formatDate(file.created_at)}</td>
                          <td>
                            <Link
                              href={`/app/team-mode/files/${file.id}`}
                              className="btn btnSecondary btnSmall"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "insights" && (
          <div className="bvInsightsTab bvAnimFadeIn">
            <div className="bvTabHeader">
              <h2>AI-Generated Insights</h2>
            </div>
            {recentInsights.length === 0 ? (
              <div className="bvEmptyState">
                <Lightbulb size={32} />
                <p>No insights yet. Upload data to generate insights.</p>
              </div>
            ) : (
              <div className="bvInsightsGrid">
                {recentInsights.map((insight) => (
                  <div key={insight.id} className="bvInsightCard bvInsightCardFull">
                    <div className="bvInsightHeader">
                      {getInsightIcon(insight.insight_type)}
                      <span
                        className={`bvInsightType bvInsightType-${insight.insight_type}`}
                      >
                        {insight.insight_type}
                      </span>
                      <span
                        className={`bvCategoryBadge ${insight.is_opponent_insight ? "bvOpponent" : "bvOwnTeam"}`}
                      >
                        {insight.is_opponent_insight
                          ? insight.opponent_name || "Opponent"
                          : getPlayerName(insight.player)}
                      </span>
                    </div>
                    <h3>{insight.title}</h3>
                    <p>{insight.description}</p>
                    <div className="bvInsightMeta">
                      <span className="bvConfidence">
                        {Math.round(insight.confidence_score * 100)}% confidence
                      </span>
                      <span className="bvDate">{formatDate(insight.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "reports" && (
          <div className="bvReportsTab bvAnimFadeIn">
            <div className="bvTabHeader">
              <h2>Scouting Reports</h2>
              {isCoach && (
                <Link href="/app/team-mode/reports/new" className="btn btnPrimary">
                  <Plus size={16} />
                  New Report
                </Link>
              )}
            </div>
            {recentReports.length === 0 ? (
              <div className="bvEmptyState">
                <FileText size={32} />
                <p>No reports created yet</p>
                {isCoach && (
                  <Link href="/app/team-mode/reports/new" className="btn btnPrimary">
                    Create Report
                  </Link>
                )}
              </div>
            ) : (
              <div className="bvReportsGrid">
                {recentReports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/app/team-mode/reports/${report.id}`}
                    className="bvReportCard"
                  >
                    <div className="bvReportHeader">
                      <span
                        className={`bvCategoryBadge ${report.report_category === "opponent" ? "bvOpponent" : "bvOwnTeam"}`}
                      >
                        {report.report_category === "opponent" ? "Opponent" : "Own Team"}
                      </span>
                      <span className={`bvStatusBadge bvStatus-${report.status}`}>
                        {report.status}
                      </span>
                    </div>
                    <h3>{report.title}</h3>
                    <div className="bvReportMeta">
                      <span>
                        {report.report_category === "own_team"
                          ? getPlayerName(report.player)
                          : report.report_type.replace(/_/g, " ")}
                      </span>
                      {report.game_date && (
                        <span>Game: {formatDate(report.game_date)}</span>
                      )}
                    </div>
                    <div className="bvReportFooter">
                      <span>{formatDate(report.created_at)}</span>
                      {report.shared_with_player && (
                        <span className="bvSharedBadge">Shared</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .bvTeamMode {
          padding-bottom: 40px;
        }

        .bvTeamModeHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          gap: 16px;
        }

        .bvTeamModeHeader h1 {
          margin: 0 0 4px;
        }

        .bvHeaderActions {
          display: flex;
          gap: 8px;
        }

        .bvTabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 24px;
          overflow-x: auto;
        }

        .bvTab {
          padding: 12px 16px;
          background: none;
          border: none;
          color: var(--muted);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          white-space: nowrap;
        }

        .bvTab:hover {
          color: var(--text);
        }

        .bvTabActive {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }

        .bvStatsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .bvStatCard {
          display: flex;
          gap: 16px;
          padding: 20px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
        }

        .bvStatIcon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(99, 179, 255, 0.1);
          border-radius: 12px;
          color: var(--primary);
        }

        .bvStatContent {
          display: flex;
          flex-direction: column;
        }

        .bvStatValue {
          font-size: 28px;
          font-weight: 700;
          line-height: 1;
        }

        .bvStatLabel {
          font-size: 14px;
          font-weight: 500;
          margin-top: 4px;
        }

        .bvStatDetail {
          font-size: 12px;
          color: var(--muted);
          margin-top: 2px;
        }

        .bvRecentSection,
        .bvQuickActions {
          margin-bottom: 32px;
        }

        .bvRecentSection h2,
        .bvQuickActions h2 {
          font-size: 16px;
          margin: 0 0 16px;
        }

        .bvEmptyState {
          text-align: center;
          padding: 48px 24px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
        }

        .bvEmptyState svg {
          color: var(--muted);
          margin-bottom: 16px;
        }

        .bvEmptyState p {
          color: var(--muted);
          margin: 0 0 16px;
        }

        .bvInsightsList,
        .bvInsightsGrid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bvInsightCard {
          padding: 16px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
        }

        .bvInsightHeader {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .bvInsightType {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.1);
        }

        .bvInsightType-strength {
          color: #00c853;
          background: rgba(0, 200, 83, 0.1);
        }
        .bvInsightType-weakness {
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
        }
        .bvInsightType-trend {
          color: #63b3ff;
          background: rgba(99, 179, 255, 0.1);
        }
        .bvInsightType-recommendation {
          color: #ffc107;
          background: rgba(255, 193, 7, 0.1);
        }
        .bvInsightType-tendency {
          color: #ab47bc;
          background: rgba(171, 71, 188, 0.1);
        }
        .bvInsightType-alert {
          color: #ff9800;
          background: rgba(255, 152, 0, 0.1);
        }

        .bvCategoryBadge {
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 4px;
          margin-left: auto;
        }

        .bvCategoryBadge.bvOwnTeam {
          color: #63b3ff;
          background: rgba(99, 179, 255, 0.1);
        }

        .bvCategoryBadge.bvOpponent {
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
        }

        .bvInsightCard h3 {
          font-size: 15px;
          margin: 0 0 4px;
        }

        .bvInsightCard p {
          font-size: 13px;
          color: var(--muted);
          margin: 0;
          line-height: 1.5;
        }

        .bvInsightMeta {
          display: flex;
          gap: 16px;
          margin-top: 12px;
          font-size: 12px;
          color: var(--muted);
        }

        .bvConfidence {
          color: var(--primary);
        }

        .bvActionGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .bvActionCard {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          text-decoration: none;
          color: var(--text);
          transition: all 0.15s ease;
        }

        .bvActionCard:hover {
          border-color: var(--primary);
          background: rgba(99, 179, 255, 0.05);
        }

        .bvActionCard span {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
        }

        .bvTabHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .bvTabHeader h2 {
          margin: 0;
          font-size: 18px;
        }

        .bvFilesTable {
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 12px;
        }

        .bvFilesTable table {
          width: 100%;
          border-collapse: collapse;
        }

        .bvFilesTable th,
        .bvFilesTable td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }

        .bvFilesTable th {
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.03);
        }

        .bvFilesTable tr:last-child td {
          border-bottom: none;
        }

        .bvStatusBadge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          text-transform: capitalize;
        }

        .bvStatusCompleted {
          color: #00c853;
        }
        .bvStatusProcessing {
          color: #63b3ff;
        }
        .bvStatusFailed {
          color: #ff6b6b;
        }
        .bvStatusPending {
          color: var(--muted);
        }

        .bvSpinner {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .bvReportsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .bvReportCard {
          display: block;
          padding: 16px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          text-decoration: none;
          color: var(--text);
          transition: all 0.15s ease;
        }

        .bvReportCard:hover {
          border-color: var(--primary);
          transform: translateY(-2px);
        }

        .bvReportHeader {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .bvReportCard h3 {
          font-size: 15px;
          margin: 0 0 8px;
        }

        .bvReportMeta {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--muted);
        }

        .bvReportFooter {
          display: flex;
          justify-content: space-between;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--border);
          font-size: 12px;
          color: var(--muted);
        }

        .bvSharedBadge {
          color: #00c853;
        }

        .bvStatus-draft {
          color: var(--muted);
        }
        .bvStatus-final {
          color: #00c853;
        }
        .bvStatus-archived {
          color: var(--muted);
        }

        .btnSmall {
          padding: 6px 12px;
          font-size: 12px;
        }

        @media (max-width: 768px) {
          .bvTeamModeHeader {
            flex-direction: column;
          }

          .bvHeaderActions {
            width: 100%;
          }

          .bvHeaderActions .btn {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}

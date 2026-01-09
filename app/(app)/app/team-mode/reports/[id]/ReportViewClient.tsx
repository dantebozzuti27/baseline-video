"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Share2,
  Edit,
  Trash2,
  CheckCircle2,
  Archive,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Target,
  Clock,
  Loader2,
} from "lucide-react";

type Player = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
} | null;

type Opponent = {
  id: string;
  name: string;
  opponent_type: string;
  sport_context: string | null;
} | null;

type DataSource = {
  id: string;
  data_file: {
    id: string;
    file_name: string;
    row_count: number;
    created_at: string;
  } | null;
};

type Report = {
  id: string;
  team_id: string;
  title: string;
  summary: string | null;
  report_category: string;
  report_type: string;
  status: string;
  game_date: string | null;
  shared_with_player: boolean;
  content_sections: Record<string, unknown>;
  key_metrics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  player: Player;
  creator: Player;
  opponent: Opponent;
};

type Props = {
  report: Report;
  dataSources: DataSource[];
  isCoach: boolean;
  currentUserId: string;
};

export default function ReportViewClient({
  report,
  dataSources,
  isCoach,
}: Props) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = React.useState(false);

  const getPlayerName = (player: Player) => {
    if (!player) return "Unknown";
    return (
      player.display_name ||
      [player.first_name, player.last_name].filter(Boolean).join(" ") ||
      "Unknown"
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const content = report.content_sections as {
    executive_summary?: string;
    dynamic_sections?: Array<{
      section_title: string;
      section_type: string;
      content: string;
      key_points?: Array<{
        point: string;
        importance: string;
      }>;
    }>;
    strengths?: Array<{
      title: string;
      description: string;
      impact: string;
    }>;
    areas_for_development?: Array<{
      title: string;
      description: string;
      priority: string;
      recommended_actions?: string[];
    }>;
    action_plan?: Array<{
      category: string;
      specific_actions: string[];
      timeline?: string;
    }>;
    additional_observations?: string;
  };

  const handleShare = async () => {
    if (!isCoach) return;
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/team-mode/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_with_player: !report.shared_with_player,
        }),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!isCoach) return;
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/team-mode/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        router.refresh();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this report?")) return;
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/team-mode/reports/${report.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        router.push("/app/team-mode?tab=reports");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const getSectionIcon = (type: string) => {
    switch (type) {
      case "strength":
        return <TrendingUp size={18} />;
      case "weakness":
        return <TrendingDown size={18} />;
      case "trend":
        return <TrendingUp size={18} />;
      case "analysis":
        return <Target size={18} />;
      case "recommendation":
        return <Lightbulb size={18} />;
      default:
        return <Lightbulb size={18} />;
    }
  };

  return (
    <div className="bvReportView">
      {/* Header */}
      <div className="bvReportHeader">
        <Link href="/app/team-mode?tab=reports" className="bvBackLink">
          <ArrowLeft size={20} />
          Back to Reports
        </Link>

        <div className="bvReportMeta">
          <span
            className={`bvCategoryBadge ${report.report_category === "opponent" ? "bvOpponent" : "bvOwnTeam"}`}
          >
            {report.report_category === "opponent" ? "Opponent Report" : "Own Team Report"}
          </span>
          <span className={`bvStatusBadge bvStatus-${report.status}`}>
            {report.status}
          </span>
          {report.shared_with_player && (
            <span className="bvSharedBadge">
              <CheckCircle2 size={14} />
              Shared with player
            </span>
          )}
        </div>

        <h1>{report.title}</h1>

        <div className="bvReportInfo">
          {report.report_category === "own_team" && report.player && (
            <span>Player: {getPlayerName(report.player)}</span>
          )}
          {report.report_category === "opponent" && (
            <span>Opponent: {report.opponent?.name || "Unknown"}</span>
          )}
          {report.game_date && <span>Game: {formatDate(report.game_date)}</span>}
          <span>Created: {formatDate(report.created_at)}</span>
          <span>By: {getPlayerName(report.creator)}</span>
        </div>

        {isCoach && (
          <div className="bvReportActions">
            <button
              className="btn btnSecondary"
              onClick={handleShare}
              disabled={isUpdating || report.report_category === "opponent"}
            >
              {isUpdating ? (
                <Loader2 size={16} className="bvSpinner" />
              ) : (
                <Share2 size={16} />
              )}
              {report.shared_with_player ? "Unshare" : "Share with Player"}
            </button>

            {report.status === "draft" && (
              <button
                className="btn btnPrimary"
                onClick={() => handleStatusChange("final")}
                disabled={isUpdating}
              >
                <CheckCircle2 size={16} />
                Finalize
              </button>
            )}

            {report.status === "final" && (
              <button
                className="btn btnSecondary"
                onClick={() => handleStatusChange("archived")}
                disabled={isUpdating}
              >
                <Archive size={16} />
                Archive
              </button>
            )}

            <Link
              href={`/app/team-mode/reports/${report.id}/edit`}
              className="btn btnSecondary"
            >
              <Edit size={16} />
              Edit
            </Link>

            <button
              className="btn btnDanger"
              onClick={handleDelete}
              disabled={isUpdating}
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Executive Summary */}
      {content.executive_summary && (
        <section className="bvReportSection bvSummarySection">
          <h2>Executive Summary</h2>
          <div className="bvSummaryContent">
            {content.executive_summary.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </section>
      )}

      {/* Dynamic Sections */}
      {content.dynamic_sections && content.dynamic_sections.length > 0 && (
        <div className="bvDynamicSections">
          {content.dynamic_sections.map((section, i) => (
            <section key={i} className="bvReportSection">
              <div className="bvSectionHeader">
                <span
                  className={`bvSectionIcon bvSectionType-${section.section_type}`}
                >
                  {getSectionIcon(section.section_type)}
                </span>
                <h2>{section.section_title}</h2>
              </div>
              <div className="bvSectionContent">
                {section.content.split("\n\n").map((para, j) => (
                  <p key={j}>{para}</p>
                ))}
              </div>
              {section.key_points && section.key_points.length > 0 && (
                <ul className="bvKeyPoints">
                  {section.key_points.map((point, k) => (
                    <li
                      key={k}
                      className={`bvImportance-${point.importance}`}
                    >
                      {point.point}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Strengths */}
      {content.strengths && content.strengths.length > 0 && (
        <section className="bvReportSection">
          <h2>
            <TrendingUp size={20} />
            Strengths
          </h2>
          <div className="bvStrengthsList">
            {content.strengths.map((strength, i) => (
              <div key={i} className="bvStrengthCard">
                <div className="bvStrengthHeader">
                  <h3>{strength.title}</h3>
                  <span className={`bvImpact bvImpact-${strength.impact}`}>
                    {strength.impact}
                  </span>
                </div>
                <p>{strength.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Areas for Development */}
      {content.areas_for_development && content.areas_for_development.length > 0 && (
        <section className="bvReportSection">
          <h2>
            <Target size={20} />
            Areas for Development
          </h2>
          <div className="bvDevelopmentList">
            {content.areas_for_development.map((area, i) => (
              <div key={i} className="bvDevelopmentCard">
                <div className="bvDevelopmentHeader">
                  <h3>{area.title}</h3>
                  <span className={`bvPriority bvPriority-${area.priority}`}>
                    {area.priority} priority
                  </span>
                </div>
                <p>{area.description}</p>
                {area.recommended_actions && area.recommended_actions.length > 0 && (
                  <ul className="bvActionsList">
                    {area.recommended_actions.map((action, j) => (
                      <li key={j}>{action}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action Plan */}
      {content.action_plan && content.action_plan.length > 0 && (
        <section className="bvReportSection">
          <h2>
            <Lightbulb size={20} />
            Action Plan
          </h2>
          <div className="bvActionPlan">
            {content.action_plan.map((category, i) => (
              <div key={i} className="bvActionCategory">
                <div className="bvCategoryHeader">
                  <h3>{category.category}</h3>
                  {category.timeline && (
                    <span className="bvTimeline">
                      <Clock size={14} />
                      {category.timeline}
                    </span>
                  )}
                </div>
                <ul>
                  {category.specific_actions.map((action, j) => (
                    <li key={j}>{action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Additional Observations */}
      {content.additional_observations && (
        <section className="bvReportSection">
          <h2>Additional Observations</h2>
          <p>{content.additional_observations}</p>
        </section>
      )}

      {/* Data Sources */}
      {dataSources.length > 0 && (
        <section className="bvReportSection bvDataSources">
          <h2>Data Sources</h2>
          <ul>
            {dataSources.map((source) => (
              <li key={source.id}>
                {source.data_file ? (
                  <Link href={`/app/team-mode/files/${source.data_file.id}`}>
                    {source.data_file.file_name} ({source.data_file.row_count} rows)
                  </Link>
                ) : (
                  "Unknown file"
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <style jsx>{`
        .bvReportView {
          max-width: 900px;
          margin: 0 auto;
          padding-bottom: 60px;
        }

        .bvReportHeader {
          margin-bottom: 32px;
        }

        .bvBackLink {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          font-size: 14px;
          margin-bottom: 16px;
        }

        .bvBackLink:hover {
          color: var(--text);
        }

        .bvReportMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .bvCategoryBadge {
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 4px;
        }

        .bvCategoryBadge.bvOwnTeam {
          color: #63b3ff;
          background: rgba(99, 179, 255, 0.1);
        }

        .bvCategoryBadge.bvOpponent {
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
        }

        .bvStatusBadge {
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 4px;
          text-transform: capitalize;
        }

        .bvStatus-draft {
          color: var(--muted);
          background: rgba(255, 255, 255, 0.05);
        }

        .bvStatus-final {
          color: #00c853;
          background: rgba(0, 200, 83, 0.1);
        }

        .bvStatus-archived {
          color: var(--muted);
          background: rgba(255, 255, 255, 0.05);
        }

        .bvSharedBadge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: #00c853;
        }

        .bvReportHeader h1 {
          margin: 0 0 12px;
          font-size: 28px;
        }

        .bvReportInfo {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          color: var(--muted);
          font-size: 14px;
        }

        .bvReportActions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 20px;
        }

        .bvReportSection {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
        }

        .bvReportSection h2 {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 16px;
          font-size: 18px;
        }

        .bvSummarySection {
          background: linear-gradient(
            135deg,
            rgba(99, 179, 255, 0.05),
            rgba(99, 179, 255, 0.02)
          );
          border-color: rgba(99, 179, 255, 0.2);
        }

        .bvSummaryContent p {
          margin: 0 0 16px;
          font-size: 15px;
          line-height: 1.7;
        }

        .bvSummaryContent p:last-child {
          margin-bottom: 0;
        }

        .bvSectionHeader {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
        }

        .bvSectionHeader h2 {
          margin: 0;
        }

        .bvSectionIcon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }

        .bvSectionType-strength {
          color: #00c853;
          background: rgba(0, 200, 83, 0.1);
        }
        .bvSectionType-weakness {
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
        }
        .bvSectionType-trend {
          color: #63b3ff;
          background: rgba(99, 179, 255, 0.1);
        }
        .bvSectionType-analysis {
          color: #ab47bc;
          background: rgba(171, 71, 188, 0.1);
        }
        .bvSectionType-recommendation {
          color: #ffc107;
          background: rgba(255, 193, 7, 0.1);
        }

        .bvSectionContent p {
          margin: 0 0 12px;
          line-height: 1.6;
        }

        .bvKeyPoints {
          margin: 16px 0 0;
          padding: 0;
          list-style: none;
        }

        .bvKeyPoints li {
          padding: 8px 12px;
          margin-bottom: 6px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          font-size: 14px;
        }

        .bvImportance-high {
          border-left: 3px solid #ff6b6b;
        }

        .bvImportance-medium {
          border-left: 3px solid #ffc107;
        }

        .bvImportance-low {
          border-left: 3px solid var(--muted);
        }

        .bvStrengthsList,
        .bvDevelopmentList {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bvStrengthCard,
        .bvDevelopmentCard {
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
        }

        .bvStrengthHeader,
        .bvDevelopmentHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .bvStrengthHeader h3,
        .bvDevelopmentHeader h3 {
          margin: 0;
          font-size: 15px;
        }

        .bvStrengthCard p,
        .bvDevelopmentCard p {
          margin: 0;
          font-size: 14px;
          color: var(--muted);
        }

        .bvImpact,
        .bvPriority {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: capitalize;
        }

        .bvImpact-high,
        .bvPriority-high {
          color: #ff6b6b;
          background: rgba(255, 107, 107, 0.1);
        }

        .bvImpact-medium,
        .bvPriority-medium {
          color: #ffc107;
          background: rgba(255, 193, 7, 0.1);
        }

        .bvImpact-low,
        .bvPriority-low {
          color: var(--muted);
          background: rgba(255, 255, 255, 0.05);
        }

        .bvActionsList {
          margin: 12px 0 0;
          padding-left: 20px;
        }

        .bvActionsList li {
          font-size: 13px;
          margin-bottom: 4px;
          color: var(--text);
        }

        .bvActionPlan {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .bvActionCategory {
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
        }

        .bvCategoryHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .bvCategoryHeader h3 {
          margin: 0;
          font-size: 15px;
        }

        .bvTimeline {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--muted);
        }

        .bvActionCategory ul {
          margin: 0;
          padding-left: 20px;
        }

        .bvActionCategory li {
          font-size: 14px;
          margin-bottom: 6px;
        }

        .bvDataSources {
          background: transparent;
          border: none;
          padding: 0;
        }

        .bvDataSources h2 {
          font-size: 14px;
          color: var(--muted);
        }

        .bvDataSources ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .bvDataSources li {
          font-size: 13px;
          color: var(--muted);
        }

        .bvDataSources a {
          color: var(--primary);
        }

        .btnDanger {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid rgba(255, 107, 107, 0.3);
          color: var(--danger);
        }

        .btnDanger:hover {
          background: rgba(255, 107, 107, 0.2);
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

        @media (max-width: 640px) {
          .bvReportActions {
            flex-direction: column;
          }

          .bvReportActions .btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

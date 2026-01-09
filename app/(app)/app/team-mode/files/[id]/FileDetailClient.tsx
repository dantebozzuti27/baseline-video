"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Target,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type Player = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
} | null;

type FileRecord = {
  id: string;
  team_id: string;
  file_name: string;
  storage_path: string;
  file_type: string;
  is_opponent_data: boolean;
  opponent_name: string | null;
  row_count: number;
  processing_status: string;
  processed_at: string | null;
  created_at: string;
  detected_columns: Record<string, unknown>;
  metadata: Record<string, unknown>;
  player: Player;
  uploader: Player;
};

type Metric = {
  id: string;
  raw_data: Record<string, unknown>;
  ai_interpreted_data: Record<string, unknown>;
  metric_date: string | null;
};

type Insight = {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  confidence_score: number;
  supporting_data: Record<string, unknown>;
  action_items: string[];
};

type Props = {
  file: FileRecord;
  metrics: Metric[];
  insights: Insight[];
  isCoach: boolean;
};

export default function FileDetailClient({
  file,
  metrics,
  insights,
  isCoach,
}: Props) {
  const router = useRouter();
  const [activeDataTab, setActiveDataTab] = React.useState<"raw" | "interpreted">("raw");
  const [expandedInsight, setExpandedInsight] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const getPlayerName = (player: Player) => {
    if (!player) return "Unknown";
    return (
      player.display_name ||
      [player.first_name, player.last_name].filter(Boolean).join(" ") ||
      "Unknown"
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 size={16} className="bvStatusCompleted" />;
      case "processing":
        return <Loader2 size={16} className="bvStatusProcessing bvSpinner" />;
      case "failed":
        return <XCircle size={16} className="bvStatusFailed" />;
      default:
        return <Clock size={16} className="bvStatusPending" />;
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "strength":
        return <TrendingUp size={16} />;
      case "weakness":
        return <TrendingDown size={16} />;
      case "trend":
        return <TrendingUp size={16} />;
      case "recommendation":
        return <Lightbulb size={16} />;
      case "tendency":
        return <Target size={16} />;
      case "alert":
        return <AlertCircle size={16} />;
      default:
        return <Lightbulb size={16} />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this file and all associated data?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/team-mode/files/${file.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/app/team-mode");
        router.refresh(); // Force refresh to clear cached data
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete file");
      }
    } catch {
      alert("Failed to delete file");
    } finally {
      setIsDeleting(false);
    }
  };

  const columnInterpretations = (file.detected_columns as { column_interpretations?: Record<string, unknown> })?.column_interpretations || {};
  const detectedSport = (file.detected_columns as { detected_sport?: string })?.detected_sport || "Unknown";
  const confidence = (file.detected_columns as { confidence?: number })?.confidence || 0;
  const dataQualityNotes = (file.detected_columns as { data_quality_notes?: string[] })?.data_quality_notes || [];
  const suggestedSections = (file.detected_columns as { suggested_report_sections?: string[] })?.suggested_report_sections || [];

  // Get column headers from first metric
  const rawHeaders = metrics.length > 0 ? Object.keys(metrics[0].raw_data) : [];

  return (
    <div className="bvFileDetail">
      {/* Header */}
      <div className="bvFileHeader">
        <Link href="/app/team-mode" className="bvBackLink">
          <ArrowLeft size={20} />
          Back to Team Mode
        </Link>

        <div className="bvFileTitle">
          <FileSpreadsheet size={24} />
          <div>
            <h1>{file.file_name}</h1>
            <div className="bvFileMeta">
              <span
                className={`bvCategoryBadge ${file.is_opponent_data ? "bvOpponent" : "bvOwnTeam"}`}
              >
                {file.is_opponent_data ? "Opponent Data" : "Team Data"}
              </span>
              <span className="bvStatusBadge">
                {getStatusIcon(file.processing_status)}
                {file.processing_status}
              </span>
            </div>
          </div>
        </div>

        {isCoach && (
          <div className="bvFileActions">
            <button className="btn btnSecondary" disabled>
              <RefreshCw size={16} />
              Reprocess
            </button>
            <button className="btn btnSecondary" disabled>
              <Download size={16} />
              Download
            </button>
            <button
              className="btn btnDanger"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 size={16} className="bvSpinner" /> : <Trash2 size={16} />}
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="bvInfoGrid">
        <div className="card bvInfoCard">
          <h3>File Information</h3>
          <dl>
            <div>
              <dt>Category</dt>
              <dd>{file.is_opponent_data ? "Opponent" : "Own Team"}</dd>
            </div>
            <div>
              <dt>{file.is_opponent_data ? "Opponent" : "Player"}</dt>
              <dd>
                {file.is_opponent_data
                  ? file.opponent_name || "Unknown"
                  : getPlayerName(file.player)}
              </dd>
            </div>
            <div>
              <dt>Uploaded</dt>
              <dd>{formatDate(file.created_at)}</dd>
            </div>
            <div>
              <dt>Uploaded By</dt>
              <dd>{getPlayerName(file.uploader)}</dd>
            </div>
            <div>
              <dt>Rows</dt>
              <dd>{file.row_count.toLocaleString()}</dd>
            </div>
            <div>
              <dt>File Size</dt>
              <dd>
                {formatFileSize(
                  (file.metadata as { original_size?: number })?.original_size || 0
                )}
              </dd>
            </div>
            {file.processed_at && (
              <div>
                <dt>Processed</dt>
                <dd>{formatDate(file.processed_at)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="card bvInfoCard">
          <h3>AI Interpretation</h3>
          <dl>
            <div>
              <dt>Detected Sport</dt>
              <dd>{detectedSport}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{Math.round(confidence * 100)}%</dd>
            </div>
            <div>
              <dt>Columns Detected</dt>
              <dd>{Object.keys(columnInterpretations).length}</dd>
            </div>
          </dl>

          {dataQualityNotes.length > 0 && (
            <div className="bvQualityNotes">
              <h4>Data Quality Notes</h4>
              <ul>
                {dataQualityNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {suggestedSections.length > 0 && (
            <div className="bvSuggestedSections">
              <h4>Suggested Report Sections</h4>
              <div className="bvTagList">
                {suggestedSections.map((section, i) => (
                  <span key={i} className="bvTag">
                    {section}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Column Interpretations */}
      {Object.keys(columnInterpretations).length > 0 && (
        <div className="card bvSection">
          <h3>Column Interpretations</h3>
          <div className="bvColumnsTable">
            <table>
              <thead>
                <tr>
                  <th>Original Column</th>
                  <th>Interpreted As</th>
                  <th>Type</th>
                  <th>Key Metric</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(columnInterpretations).map(([col, interp]) => {
                  const interpretation = interp as {
                    interpreted_as?: string;
                    data_type?: string;
                    is_key_metric?: boolean;
                    description?: string;
                  };
                  return (
                    <tr key={col}>
                      <td><code>{col}</code></td>
                      <td>{interpretation.interpreted_as || "-"}</td>
                      <td>{interpretation.data_type || "-"}</td>
                      <td>
                        {interpretation.is_key_metric ? (
                          <CheckCircle2 size={14} className="bvStatusCompleted" />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{interpretation.description || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data Preview */}
      <div className="card bvSection">
        <div className="bvSectionHeader">
          <h3>Data Preview</h3>
          <div className="bvDataTabs">
            <button
              className={activeDataTab === "raw" ? "active" : ""}
              onClick={() => setActiveDataTab("raw")}
            >
              Raw Data
            </button>
            <button
              className={activeDataTab === "interpreted" ? "active" : ""}
              onClick={() => setActiveDataTab("interpreted")}
            >
              Interpreted Data
            </button>
          </div>
        </div>

        {metrics.length === 0 ? (
          <p className="bvMuted">No data available</p>
        ) : activeDataTab === "raw" ? (
          <div className="bvDataTable">
            <table>
              <thead>
                <tr>
                  {rawHeaders.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.id}>
                    {rawHeaders.map((header) => (
                      <td key={header}>
                        {String(metric.raw_data[header] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bvDataTable">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Metrics</th>
                  <th>Calculated</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => {
                  const interpreted = metric.ai_interpreted_data as {
                    metrics?: Record<string, unknown>;
                    calculated_metrics?: Record<string, unknown>;
                    confidence?: number;
                  };
                  return (
                    <tr key={metric.id}>
                      <td>{metric.metric_date || "-"}</td>
                      <td>
                        <code>
                          {JSON.stringify(interpreted.metrics || {}).slice(0, 100)}
                          {JSON.stringify(interpreted.metrics || {}).length > 100 ? "..." : ""}
                        </code>
                      </td>
                      <td>
                        <code>
                          {JSON.stringify(interpreted.calculated_metrics || {})}
                        </code>
                      </td>
                      <td>
                        {interpreted.confidence
                          ? `${Math.round(interpreted.confidence * 100)}%`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {file.row_count > 50 && (
          <p className="bvMuted" style={{ marginTop: 12 }}>
            Showing 50 of {file.row_count.toLocaleString()} rows
          </p>
        )}
      </div>

      {/* Insights */}
      <div className="card bvSection">
        <div className="bvSectionHeader">
          <h3>Generated Insights ({insights.length})</h3>
          {isCoach && insights.length > 0 && (
            <Link
              href={`/app/team-mode/reports/new?fileId=${file.id}`}
              className="btn btnPrimary"
            >
              <FileText size={16} />
              Create Report
            </Link>
          )}
        </div>

        {insights.length === 0 ? (
          <p className="bvMuted">No insights generated yet</p>
        ) : (
          <div className="bvInsightsList">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`bvInsightCard ${expandedInsight === insight.id ? "expanded" : ""}`}
              >
                <div
                  className="bvInsightCardHeader"
                  onClick={() =>
                    setExpandedInsight(
                      expandedInsight === insight.id ? null : insight.id
                    )
                  }
                >
                  <div className="bvInsightLeft">
                    <span className={`bvInsightIcon bvInsightType-${insight.insight_type}`}>
                      {getInsightIcon(insight.insight_type)}
                    </span>
                    <div>
                      <span className={`bvInsightTypeBadge bvInsightType-${insight.insight_type}`}>
                        {insight.insight_type}
                      </span>
                      <h4>{insight.title}</h4>
                    </div>
                  </div>
                  <div className="bvInsightRight">
                    <span className="bvConfidence">
                      {Math.round(insight.confidence_score * 100)}%
                    </span>
                    {expandedInsight === insight.id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </div>

                {expandedInsight === insight.id && (
                  <div className="bvInsightDetails bvAnimSlideUp">
                    <p>{insight.description}</p>

                    {insight.action_items && insight.action_items.length > 0 && (
                      <div className="bvActionItems">
                        <h5>Action Items</h5>
                        <ul>
                          {insight.action_items.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {Object.keys(insight.supporting_data).length > 0 && (
                      <div className="bvSupportingData">
                        <h5>Supporting Data</h5>
                        <pre>
                          {JSON.stringify(insight.supporting_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .bvFileDetail {
          padding-bottom: 40px;
        }

        .bvFileHeader {
          margin-bottom: 24px;
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

        .bvFileTitle {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }

        .bvFileTitle svg {
          color: var(--primary);
          flex-shrink: 0;
          margin-top: 4px;
        }

        .bvFileTitle h1 {
          margin: 0 0 8px;
          font-size: 24px;
        }

        .bvFileMeta {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .bvFileActions {
          display: flex;
          gap: 8px;
          margin-top: 16px;
        }

        .bvInfoGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .bvInfoCard {
          padding: 20px;
        }

        .bvInfoCard h3 {
          font-size: 14px;
          color: var(--muted);
          margin: 0 0 16px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .bvInfoCard dl {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .bvInfoCard dl > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .bvInfoCard dt {
          font-size: 12px;
          color: var(--muted);
        }

        .bvInfoCard dd {
          font-size: 14px;
          font-weight: 500;
          margin: 0;
        }

        .bvQualityNotes,
        .bvSuggestedSections {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }

        .bvQualityNotes h4,
        .bvSuggestedSections h4 {
          font-size: 12px;
          color: var(--muted);
          margin: 0 0 8px;
        }

        .bvQualityNotes ul {
          margin: 0;
          padding-left: 16px;
          font-size: 13px;
        }

        .bvTagList {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .bvTag {
          font-size: 12px;
          padding: 4px 10px;
          background: rgba(99, 179, 255, 0.1);
          color: var(--primary);
          border-radius: 4px;
        }

        .bvSection {
          padding: 20px;
          margin-bottom: 24px;
        }

        .bvSection h3 {
          font-size: 16px;
          margin: 0;
        }

        .bvSectionHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .bvColumnsTable,
        .bvDataTable {
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .bvColumnsTable table,
        .bvDataTable table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .bvColumnsTable th,
        .bvColumnsTable td,
        .bvDataTable th,
        .bvDataTable td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }

        .bvColumnsTable th,
        .bvDataTable th {
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.03);
          text-transform: uppercase;
        }

        .bvColumnsTable tr:last-child td,
        .bvDataTable tr:last-child td {
          border-bottom: none;
        }

        .bvDataTable td {
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        code {
          font-family: ui-monospace, monospace;
          font-size: 12px;
          background: rgba(255, 255, 255, 0.05);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .bvDataTabs {
          display: flex;
          gap: 4px;
        }

        .bvDataTabs button {
          padding: 8px 16px;
          background: none;
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--muted);
          font-size: 13px;
          cursor: pointer;
        }

        .bvDataTabs button:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .bvDataTabs button.active {
          background: var(--primary);
          border-color: var(--primary);
          color: #000;
        }

        .bvInsightsList {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bvInsightCard {
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }

        .bvInsightCardHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          cursor: pointer;
        }

        .bvInsightCardHeader:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .bvInsightLeft {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .bvInsightIcon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }

        .bvInsightTypeBadge {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 6px;
          border-radius: 3px;
          display: inline-block;
          margin-bottom: 4px;
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

        .bvInsightLeft h4 {
          margin: 0;
          font-size: 14px;
        }

        .bvInsightRight {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--muted);
        }

        .bvConfidence {
          font-size: 13px;
          color: var(--primary);
        }

        .bvInsightDetails {
          padding: 16px;
          border-top: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
        }

        .bvInsightDetails p {
          margin: 0 0 16px;
          font-size: 14px;
          line-height: 1.6;
        }

        .bvActionItems h5,
        .bvSupportingData h5 {
          font-size: 12px;
          color: var(--muted);
          margin: 0 0 8px;
        }

        .bvActionItems ul {
          margin: 0;
          padding-left: 20px;
        }

        .bvActionItems li {
          font-size: 13px;
          margin-bottom: 4px;
        }

        .bvSupportingData {
          margin-top: 16px;
        }

        .bvSupportingData pre {
          margin: 0;
          padding: 12px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
          font-size: 11px;
          overflow-x: auto;
        }

        .bvCategoryBadge {
          font-size: 11px;
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

        .btnDanger {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid rgba(255, 107, 107, 0.3);
          color: var(--danger);
        }

        .btnDanger:hover {
          background: rgba(255, 107, 107, 0.2);
        }

        @media (max-width: 768px) {
          .bvFileActions {
            flex-wrap: wrap;
          }

          .bvInfoGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

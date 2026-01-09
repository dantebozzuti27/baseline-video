"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  User,
  Users,
  Target,
  FileSpreadsheet,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";

type Player = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type Opponent = {
  id: string;
  name: string;
  opponent_type: string;
  sport_context: string | null;
};

type FileRecord = {
  id: string;
  file_name: string;
  is_opponent_data: boolean;
  opponent_name: string | null;
  row_count: number;
  processing_status: string;
  created_at: string;
  detected_columns: Record<string, unknown>;
  player: Player | null;
};

type Props = {
  players: Player[];
  opponents: Opponent[];
  files: FileRecord[];
};

type ReportCategory = "own_team" | "opponent" | "matchup";
type ReportType =
  | "player_assessment"
  | "season_review"
  | "progress_report"
  | "opponent_team"
  | "opponent_player"
  | "tendency_report"
  | "matchup";

const REPORT_TYPES: Record<
  ReportCategory,
  { value: ReportType; label: string; description: string }[]
> = {
  own_team: [
    {
      value: "player_assessment",
      label: "Player Assessment",
      description: "Comprehensive analysis of player performance",
    },
    {
      value: "season_review",
      label: "Season Review",
      description: "Summary of player's season performance",
    },
    {
      value: "progress_report",
      label: "Progress Report",
      description: "Track improvement over time",
    },
  ],
  opponent: [
    {
      value: "opponent_team",
      label: "Opponent Team Analysis",
      description: "Team-wide tendencies and strategies",
    },
    {
      value: "opponent_player",
      label: "Opponent Player Profile",
      description: "Individual player scouting report",
    },
    {
      value: "tendency_report",
      label: "Tendency Report",
      description: "Focus on patterns and habits",
    },
  ],
  matchup: [
    {
      value: "matchup",
      label: "Matchup Analysis",
      description: "Compare your player vs opponent",
    },
  ],
};

const FOCUS_AREAS = [
  "Strengths",
  "Weaknesses",
  "Development Plan",
  "Progress Tracking",
  "Tendencies to Exploit",
  "Strengths to Prepare For",
  "Game Strategy",
];

export default function ReportWizard({ players, opponents, files }: Props) {
  const router = useRouter();

  const [step, setStep] = React.useState(1);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = React.useState("");

  // Form state
  const [category, setCategory] = React.useState<ReportCategory | null>(null);
  const [reportType, setReportType] = React.useState<ReportType | null>(null);
  const [title, setTitle] = React.useState("");
  const [playerUserId, setPlayerUserId] = React.useState("");
  const [opponentId, setOpponentId] = React.useState("");
  const [opponentName, setOpponentName] = React.useState("");
  const [gameDate, setGameDate] = React.useState("");
  const [focusAreas, setFocusAreas] = React.useState<string[]>([]);
  const [selectedFileIds, setSelectedFileIds] = React.useState<string[]>([]);

  // For matchup: also need opponent selection
  const [matchupOpponentId, setMatchupOpponentId] = React.useState("");
  const [matchupOpponentName, setMatchupOpponentName] = React.useState("");

  const getPlayerName = (player: Player | null) => {
    if (!player) return "Unknown";
    return (
      player.display_name ||
      [player.first_name, player.last_name].filter(Boolean).join(" ") ||
      "Unknown"
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Filter files based on category
  const availableFiles = React.useMemo(() => {
    if (!category) return [];

    if (category === "own_team") {
      return files.filter(
        (f) => !f.is_opponent_data && f.player?.user_id === playerUserId
      );
    }

    if (category === "opponent") {
      return files.filter(
        (f) =>
          f.is_opponent_data &&
          (f.opponent_name === opponentName ||
            opponents.find((o) => o.id === opponentId)?.name === f.opponent_name)
      );
    }

    if (category === "matchup") {
      // Return both player files and opponent files
      const playerFiles = files.filter(
        (f) => !f.is_opponent_data && f.player?.user_id === playerUserId
      );
      const oppName =
        matchupOpponentName ||
        opponents.find((o) => o.id === matchupOpponentId)?.name;
      const opponentFiles = files.filter(
        (f) => f.is_opponent_data && f.opponent_name === oppName
      );
      return [...playerFiles, ...opponentFiles];
    }

    return [];
  }, [category, playerUserId, opponentId, opponentName, matchupOpponentId, matchupOpponentName, files, opponents]);

  const canProceed = () => {
    switch (step) {
      case 1:
        return category !== null;
      case 2:
        if (!reportType || !title) return false;
        if (category === "own_team" && !playerUserId) return false;
        if (category === "opponent" && !opponentId && !opponentName) return false;
        if (category === "matchup" && (!playerUserId || (!matchupOpponentId && !matchupOpponentName)))
          return false;
        return true;
      case 3:
        return selectedFileIds.length > 0;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    setGenerationProgress("Analyzing data files...");

    try {
      // Determine the actual opponent name
      let finalOpponentName = opponentName;
      if (category === "opponent" && opponentId) {
        const opp = opponents.find((o) => o.id === opponentId);
        finalOpponentName = opp?.name || opponentName;
      }
      if (category === "matchup") {
        finalOpponentName =
          matchupOpponentName ||
          opponents.find((o) => o.id === matchupOpponentId)?.name ||
          "";
      }

      setGenerationProgress("Generating report with AI...");

      const response = await fetch("/api/team-mode/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType,
          reportCategory: category === "matchup" ? "own_team" : category,
          title,
          playerUserId: category !== "opponent" ? playerUserId : null,
          opponentName: finalOpponentName,
          opponentId: category === "opponent" ? opponentId : null,
          gameDate: gameDate || null,
          focusAreas,
          fileIds: selectedFileIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate report");
      }

      setGenerationProgress("Report created successfully!");

      // Redirect to report view
      setTimeout(() => {
        router.push(`/app/team-mode/reports/${data.reportId}`);
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
      setIsGenerating(false);
    }
  };

  const toggleFocusArea = (area: string) => {
    setFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const toggleFile = (fileId: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId]
    );
  };

  return (
    <div className="bvReportWizard">
      {/* Header */}
      <div className="bvWizardHeader">
        <Link href="/app/team-mode" className="bvBackLink">
          <ArrowLeft size={20} />
          Back to Team Mode
        </Link>
        <h1>Create Scouting Report</h1>
      </div>

      {/* Progress */}
      <div className="bvProgress">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`bvProgressStep ${s === step ? "active" : ""} ${s < step ? "completed" : ""}`}
          >
            <span className="bvStepNumber">
              {s < step ? <Check size={14} /> : s}
            </span>
            <span className="bvStepLabel">
              {s === 1 && "Report Type"}
              {s === 2 && "Details"}
              {s === 3 && "Data"}
              {s === 4 && "Generate"}
            </span>
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bvStepContent">
        {/* Step 1: Report Type Selection */}
        {step === 1 && (
          <div className="bvStep bvAnimFadeIn">
            <h2>What type of report do you want to create?</h2>

            <div className="bvCategoryGrid">
              <button
                className={`bvCategoryCard ${category === "own_team" ? "selected" : ""}`}
                onClick={() => {
                  setCategory("own_team");
                  setReportType(null);
                }}
              >
                <User size={32} />
                <h3>Own Team Report</h3>
                <p>Analyze your players&apos; performance, identify development areas, create training plans</p>
              </button>

              <button
                className={`bvCategoryCard ${category === "opponent" ? "selected" : ""}`}
                onClick={() => {
                  setCategory("opponent");
                  setReportType(null);
                }}
              >
                <Users size={32} />
                <h3>Opponent Report</h3>
                <p>Scout opposing teams/players, identify tendencies, create game strategies</p>
              </button>

              <button
                className={`bvCategoryCard ${category === "matchup" ? "selected" : ""}`}
                onClick={() => {
                  setCategory("matchup");
                  setReportType("matchup");
                }}
              >
                <Target size={32} />
                <h3>Matchup Report</h3>
                <p>Compare your player vs specific opponent, create targeted game plan</p>
              </button>
            </div>

            {category && category !== "matchup" && (
              <div className="bvReportTypes bvAnimSlideUp">
                <h3>Select report type:</h3>
                <div className="bvTypeGrid">
                  {REPORT_TYPES[category].map((type) => (
                    <button
                      key={type.value}
                      className={`bvTypeCard ${reportType === type.value ? "selected" : ""}`}
                      onClick={() => setReportType(type.value)}
                    >
                      <strong>{type.label}</strong>
                      <span>{type.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Report Details */}
        {step === 2 && (
          <div className="bvStep bvAnimFadeIn">
            <h2>Report Details</h2>

            <div className="bvFormSection">
              <label htmlFor="title">Report Title</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Spring 2025 Performance Review"
                className="bvInput"
              />
            </div>

            {(category === "own_team" || category === "matchup") && (
              <div className="bvFormSection">
                <label htmlFor="player">Player</label>
                <select
                  id="player"
                  value={playerUserId}
                  onChange={(e) => setPlayerUserId(e.target.value)}
                  className="bvSelect"
                >
                  <option value="">Select a player...</option>
                  {players.map((player) => (
                    <option key={player.user_id} value={player.user_id}>
                      {getPlayerName(player)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {category === "opponent" && (
              <div className="bvFormSection">
                <label htmlFor="opponent">Opponent</label>
                <select
                  id="opponent"
                  value={opponentId}
                  onChange={(e) => {
                    setOpponentId(e.target.value);
                    if (e.target.value) {
                      const opp = opponents.find((o) => o.id === e.target.value);
                      setOpponentName(opp?.name || "");
                    }
                  }}
                  className="bvSelect"
                >
                  <option value="">Select an opponent...</option>
                  {opponents.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.name} {opp.sport_context && `(${opp.sport_context})`}
                    </option>
                  ))}
                </select>
                <p className="bvHint">Or enter a new opponent:</p>
                <input
                  type="text"
                  value={opponentName}
                  onChange={(e) => {
                    setOpponentName(e.target.value);
                    setOpponentId("");
                  }}
                  placeholder="Enter opponent name"
                  className="bvInput"
                />
              </div>
            )}

            {category === "matchup" && (
              <div className="bvFormSection">
                <label htmlFor="matchupOpponent">Versus Opponent</label>
                <select
                  id="matchupOpponent"
                  value={matchupOpponentId}
                  onChange={(e) => {
                    setMatchupOpponentId(e.target.value);
                    if (e.target.value) {
                      const opp = opponents.find((o) => o.id === e.target.value);
                      setMatchupOpponentName(opp?.name || "");
                    }
                  }}
                  className="bvSelect"
                >
                  <option value="">Select an opponent...</option>
                  {opponents.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.name}
                    </option>
                  ))}
                </select>
                <p className="bvHint">Or enter name:</p>
                <input
                  type="text"
                  value={matchupOpponentName}
                  onChange={(e) => {
                    setMatchupOpponentName(e.target.value);
                    setMatchupOpponentId("");
                  }}
                  placeholder="Enter opponent name"
                  className="bvInput"
                />
              </div>
            )}

            <div className="bvFormSection">
              <label htmlFor="gameDate">Game Date (optional)</label>
              <input
                id="gameDate"
                type="date"
                value={gameDate}
                onChange={(e) => setGameDate(e.target.value)}
                className="bvInput"
              />
            </div>

            <div className="bvFormSection">
              <label>Focus Areas (optional)</label>
              <div className="bvFocusGrid">
                {FOCUS_AREAS.map((area) => (
                  <button
                    key={area}
                    className={`bvFocusTag ${focusAreas.includes(area) ? "selected" : ""}`}
                    onClick={() => toggleFocusArea(area)}
                  >
                    {focusAreas.includes(area) && <Check size={14} />}
                    {area}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Data Selection */}
        {step === 3 && (
          <div className="bvStep bvAnimFadeIn">
            <h2>Select Data Files</h2>
            <p className="bvMuted">
              Choose which data files to include in the analysis
            </p>

            {availableFiles.length === 0 ? (
              <div className="bvEmptyState">
                <FileSpreadsheet size={32} />
                <p>No matching data files found</p>
                <p className="bvMuted">
                  Upload performance data for the selected player/opponent first
                </p>
                <Link href="/app/team-mode/upload" className="btn btnPrimary">
                  Upload Data
                </Link>
              </div>
            ) : (
              <div className="bvFilesList">
                {availableFiles.map((file) => (
                  <label
                    key={file.id}
                    className={`bvFileItem ${selectedFileIds.includes(file.id) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(file.id)}
                      onChange={() => toggleFile(file.id)}
                    />
                    <FileSpreadsheet size={20} />
                    <div className="bvFileInfo">
                      <strong>{file.file_name}</strong>
                      <span>
                        {file.is_opponent_data
                          ? file.opponent_name
                          : getPlayerName(file.player)}{" "}
                        • {file.row_count} rows • {formatDate(file.created_at)}
                      </span>
                    </div>
                    {selectedFileIds.includes(file.id) && (
                      <Check size={20} className="bvCheckIcon" />
                    )}
                  </label>
                ))}
              </div>
            )}

            <div className="bvSelectedSummary">
              <strong>{selectedFileIds.length}</strong> file(s) selected
            </div>
          </div>
        )}

        {/* Step 4: Generate */}
        {step === 4 && (
          <div className="bvStep bvAnimFadeIn">
            <h2>Generate Report</h2>

            {/* Summary */}
            <div className="bvSummaryCard">
              <h3>Report Summary</h3>
              <dl>
                <div>
                  <dt>Title</dt>
                  <dd>{title}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>
                    {category === "own_team" && "Own Team Report"}
                    {category === "opponent" && "Opponent Report"}
                    {category === "matchup" && "Matchup Report"}
                    {" - "}
                    {reportType?.replace(/_/g, " ")}
                  </dd>
                </div>
                {playerUserId && (
                  <div>
                    <dt>Player</dt>
                    <dd>
                      {getPlayerName(
                        players.find((p) => p.user_id === playerUserId) || null
                      )}
                    </dd>
                  </div>
                )}
                {(opponentName || matchupOpponentName) && (
                  <div>
                    <dt>Opponent</dt>
                    <dd>{opponentName || matchupOpponentName}</dd>
                  </div>
                )}
                <div>
                  <dt>Data Files</dt>
                  <dd>{selectedFileIds.length} file(s)</dd>
                </div>
                {focusAreas.length > 0 && (
                  <div>
                    <dt>Focus Areas</dt>
                    <dd>{focusAreas.join(", ")}</dd>
                  </div>
                )}
              </dl>
            </div>

            {error && (
              <div className="bvError">
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            {isGenerating ? (
              <div className="bvGenerating">
                <Loader2 size={32} className="bvSpinner" />
                <p>{generationProgress}</p>
                <p className="bvMuted">This may take 30-60 seconds...</p>
              </div>
            ) : (
              <div className="bvGenerateAction">
                <p>
                  Click the button below to analyze your data and generate the
                  report using AI.
                </p>
                <button
                  className="btn btnPrimary btnLarge"
                  onClick={handleGenerate}
                >
                  Generate Report with AI
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {!isGenerating && (
        <div className="bvWizardNav">
          <button
            className="btn btnSecondary"
            onClick={handleBack}
            disabled={step === 1}
          >
            <ArrowLeft size={16} />
            Back
          </button>

          {step < 4 ? (
            <button
              className="btn btnPrimary"
              onClick={handleNext}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight size={16} />
            </button>
          ) : null}
        </div>
      )}

      <style jsx>{`
        .bvReportWizard {
          max-width: 800px;
          margin: 0 auto;
          padding-bottom: 40px;
        }

        .bvWizardHeader {
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

        .bvWizardHeader h1 {
          margin: 0;
        }

        .bvProgress {
          display: flex;
          justify-content: space-between;
          margin-bottom: 32px;
          padding: 0 16px;
        }

        .bvProgressStep {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex: 1;
          position: relative;
        }

        .bvProgressStep:not(:last-child)::after {
          content: "";
          position: absolute;
          top: 14px;
          left: calc(50% + 20px);
          right: calc(-50% + 20px);
          height: 2px;
          background: var(--border);
        }

        .bvProgressStep.completed:not(:last-child)::after {
          background: var(--primary);
        }

        .bvStepNumber {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--card);
          border: 2px solid var(--border);
          font-size: 12px;
          font-weight: 600;
          z-index: 1;
        }

        .bvProgressStep.active .bvStepNumber {
          border-color: var(--primary);
          background: var(--primary);
          color: #000;
        }

        .bvProgressStep.completed .bvStepNumber {
          border-color: var(--primary);
          background: var(--primary);
          color: #000;
        }

        .bvStepLabel {
          font-size: 12px;
          color: var(--muted);
        }

        .bvProgressStep.active .bvStepLabel {
          color: var(--text);
          font-weight: 500;
        }

        .bvStepContent {
          min-height: 400px;
        }

        .bvStep h2 {
          margin: 0 0 24px;
        }

        .bvCategoryGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .bvCategoryCard {
          padding: 24px;
          background: var(--card);
          border: 2px solid var(--border);
          border-radius: 12px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .bvCategoryCard:hover {
          border-color: var(--primary);
        }

        .bvCategoryCard.selected {
          border-color: var(--primary);
          background: rgba(99, 179, 255, 0.05);
        }

        .bvCategoryCard svg {
          color: var(--primary);
          margin-bottom: 12px;
        }

        .bvCategoryCard h3 {
          margin: 0 0 8px;
          font-size: 16px;
        }

        .bvCategoryCard p {
          margin: 0;
          font-size: 13px;
          color: var(--muted);
        }

        .bvReportTypes h3 {
          font-size: 14px;
          color: var(--muted);
          margin: 0 0 12px;
        }

        .bvTypeGrid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bvTypeCard {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          text-align: left;
          cursor: pointer;
        }

        .bvTypeCard:hover {
          border-color: var(--primary);
        }

        .bvTypeCard.selected {
          border-color: var(--primary);
          background: rgba(99, 179, 255, 0.05);
        }

        .bvTypeCard strong {
          font-size: 14px;
        }

        .bvTypeCard span {
          font-size: 12px;
          color: var(--muted);
        }

        .bvFormSection {
          margin-bottom: 24px;
        }

        .bvFormSection label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .bvInput,
        .bvSelect {
          width: 100%;
          padding: 12px 16px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-size: 15px;
        }

        .bvInput:focus,
        .bvSelect:focus {
          outline: none;
          border-color: var(--primary);
        }

        .bvHint {
          font-size: 12px;
          color: var(--muted);
          margin: 8px 0;
        }

        .bvFocusGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .bvFocusTag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }

        .bvFocusTag:hover {
          border-color: var(--primary);
        }

        .bvFocusTag.selected {
          border-color: var(--primary);
          background: rgba(99, 179, 255, 0.1);
          color: var(--primary);
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
          margin: 0 0 16px;
        }

        .bvFilesList {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bvFileItem {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          cursor: pointer;
        }

        .bvFileItem:hover {
          border-color: var(--primary);
        }

        .bvFileItem.selected {
          border-color: var(--primary);
          background: rgba(99, 179, 255, 0.05);
        }

        .bvFileItem input {
          display: none;
        }

        .bvFileItem svg {
          color: var(--muted);
          flex-shrink: 0;
        }

        .bvFileInfo {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .bvFileInfo strong {
          font-size: 14px;
        }

        .bvFileInfo span {
          font-size: 12px;
          color: var(--muted);
        }

        .bvCheckIcon {
          color: var(--primary);
        }

        .bvSelectedSummary {
          margin-top: 16px;
          padding: 12px;
          background: rgba(99, 179, 255, 0.1);
          border-radius: 8px;
          text-align: center;
          font-size: 14px;
        }

        .bvSummaryCard {
          padding: 24px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .bvSummaryCard h3 {
          margin: 0 0 16px;
          font-size: 14px;
          color: var(--muted);
          text-transform: uppercase;
        }

        .bvSummaryCard dl {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 12px;
        }

        .bvSummaryCard dt {
          font-size: 13px;
          color: var(--muted);
        }

        .bvSummaryCard dd {
          font-size: 14px;
          margin: 0;
        }

        .bvError {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid rgba(255, 107, 107, 0.3);
          border-radius: 12px;
          color: var(--danger);
          margin-bottom: 24px;
        }

        .bvGenerating {
          text-align: center;
          padding: 48px 24px;
        }

        .bvGenerating p {
          margin: 16px 0 0;
        }

        .bvSpinner {
          animation: spin 1s linear infinite;
          color: var(--primary);
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .bvGenerateAction {
          text-align: center;
          padding: 24px;
        }

        .bvGenerateAction p {
          margin: 0 0 24px;
          color: var(--muted);
        }

        .btnLarge {
          padding: 16px 32px;
          font-size: 16px;
        }

        .bvWizardNav {
          display: flex;
          justify-content: space-between;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }

        @media (max-width: 640px) {
          .bvProgress {
            padding: 0;
          }

          .bvStepLabel {
            display: none;
          }

          .bvCategoryGrid {
            grid-template-columns: 1fr;
          }

          .bvSummaryCard dl {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

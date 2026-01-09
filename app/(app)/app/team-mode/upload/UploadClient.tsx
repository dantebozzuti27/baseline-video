"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, User, Users, AlertCircle, Check, Loader2 } from "lucide-react";
import { parseFile, detectFileType, getPreview, type ParsedData } from "@/lib/team-mode/parse";

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

type Props = {
  players: Player[];
  opponents: Opponent[];
};

type UploadState = "idle" | "previewing" | "uploading" | "processing" | "success" | "error";

export default function UploadClient({ players, opponents }: Props) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [dataCategory, setDataCategory] = React.useState<"own_team" | "opponent">("own_team");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ParsedData | null>(null);
  const [playerUserId, setPlayerUserId] = React.useState<string>("");
  const [opponentName, setOpponentName] = React.useState<string>("");
  const [opponentContext, setOpponentContext] = React.useState<string>("");
  const [uploadState, setUploadState] = React.useState<UploadState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [uploadedFileId, setUploadedFileId] = React.useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = React.useState<string>("");

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    setError(null);
    setSelectedFile(file);

    const fileType = detectFileType(file.type, file.name);
    if (!fileType) {
      setError("Invalid file type. Please upload a CSV or Excel file.");
      setSelectedFile(null);
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("File too large. Maximum size is 50MB.");
      setSelectedFile(null);
      return;
    }

    try {
      setUploadState("previewing");
      const buffer = await file.arrayBuffer();
      const parsed = parseFile(buffer, fileType);
      const previewData = getPreview(parsed, 10);
      setPreview(previewData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
      setSelectedFile(null);
      setUploadState("idle");
    }
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    // Player selection is now optional - allow team-wide uploads
    setError(null);
    setUploadState("uploading");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("dataCategory", dataCategory);
      if (dataCategory === "own_team" && playerUserId) {
        formData.append("playerUserId", playerUserId);
      } else {
        if (opponentName) formData.append("opponentName", opponentName);
        if (opponentContext) formData.append("opponentContext", opponentContext);
      }

      setUploadState("processing");
      setProcessingStatus("Uploading and analyzing with AI...");

      const response = await fetch("/api/team-mode/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadedFileId(data.fileId);
      
      if (data.status === "completed") {
        setUploadState("success");
        setProcessingStatus(data.message || `Completed! ${data.rowCount} rows analyzed.`);
      } else if (data.status === "failed") {
        setError(data.message || "Processing failed");
        setUploadState("error");
      } else {
        // Fallback to polling if needed
        setProcessingStatus("Processing...");
        pollProcessingStatus(data.fileId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setUploadState("error");
    }
  };

  // Poll for processing status
  const pollProcessingStatus = async (fileId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/team-mode/upload?fileId=${fileId}`);
        const data = await response.json();

        if (data.processing_status === "completed") {
          setUploadState("success");
          setProcessingStatus(
            `Completed! ${data.row_count} rows analyzed, ${data.insight_count} insights generated.`
          );
          return;
        }

        if (data.processing_status === "failed") {
          const errors = data.metadata?.errors || [];
          setError(errors.join(", ") || "Processing failed");
          setUploadState("error");
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setProcessingStatus(`Processing... (${data.processing_status})`);
          setTimeout(poll, 5000);
        } else {
          setError("Processing timed out. Please check the file status later.");
          setUploadState("error");
        }
      } catch {
        setError("Failed to check processing status");
        setUploadState("error");
      }
    };

    poll();
  };

  // Get player display name
  const getPlayerName = (player: Player) => {
    return (
      player.display_name ||
      [player.first_name, player.last_name].filter(Boolean).join(" ") ||
      "Unknown Player"
    );
  };

  return (
    <div className="bvUploadPage">
      <div className="bvPageHeader">
        <h1>Upload Performance Data</h1>
        <p className="bvMuted">
          Upload CSV or Excel files with player statistics for AI analysis
        </p>
      </div>

      {/* Step 1: Data Category Selection */}
      <div className="card bvUploadSection">
        <h2>1. Data Category</h2>
        <div className="bvCategorySelector">
          <label
            className={`bvCategoryOption ${dataCategory === "own_team" ? "bvActive" : ""}`}
          >
            <input
              type="radio"
              name="dataCategory"
              value="own_team"
              checked={dataCategory === "own_team"}
              onChange={() => setDataCategory("own_team")}
              disabled={uploadState !== "idle" && uploadState !== "previewing"}
            />
            <User size={24} />
            <div>
              <strong>My Team Data</strong>
              <span>
                Upload stats for your players to analyze performance and create
                development plans
              </span>
            </div>
          </label>

          <label
            className={`bvCategoryOption ${dataCategory === "opponent" ? "bvActive" : ""}`}
          >
            <input
              type="radio"
              name="dataCategory"
              value="opponent"
              checked={dataCategory === "opponent"}
              onChange={() => setDataCategory("opponent")}
              disabled={uploadState !== "idle" && uploadState !== "previewing"}
            />
            <Users size={24} />
            <div>
              <strong>Opponent Data</strong>
              <span>
                Upload stats on opposing teams/players to scout tendencies and
                create game strategies
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Step 2: File Upload */}
      <div className="card bvUploadSection">
        <h2>2. Upload File</h2>
        <div
          className={`bvDropZone ${selectedFile ? "bvHasFile" : ""}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
            style={{ display: "none" }}
            disabled={uploadState === "uploading" || uploadState === "processing"}
          />

          {selectedFile ? (
            <div className="bvSelectedFile">
              <FileSpreadsheet size={32} />
              <div>
                <strong>{selectedFile.name}</strong>
                <span>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                  {preview && ` • ${preview.rowCount} rows`}
                </span>
              </div>
              <button
                className="btn btnSecondary"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  setPreview(null);
                  setUploadState("idle");
                }}
                disabled={uploadState === "uploading" || uploadState === "processing"}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <Upload size={48} />
              <p>Click to browse or drag file here</p>
              <span className="bvMuted">
                Accepts .csv and .xlsx files (max 50MB)
              </span>
            </>
          )}
        </div>
      </div>

      {/* Step 3: Assignment */}
      {selectedFile && (
        <div className="card bvUploadSection bvAnimSlideUp">
          <h2>
            3. {dataCategory === "own_team" ? "Player Selection" : "Opponent Details"}
          </h2>

          {dataCategory === "own_team" ? (
            <div className="bvFormGroup">
              <label htmlFor="player">Which player is this data for? <span className="bvOptional">(optional)</span></label>
              <select
                id="player"
                value={playerUserId}
                onChange={(e) => setPlayerUserId(e.target.value)}
                disabled={uploadState === "uploading" || uploadState === "processing"}
                className="bvSelect"
              >
                <option value="">Team-wide / AI will detect</option>
                {players.map((player) => (
                  <option key={player.user_id} value={player.user_id}>
                    {getPlayerName(player)}
                  </option>
                ))}
              </select>
              <p className="bvHelpText">
                Leave blank for team-wide stats or if the file contains multiple players. 
                AI will attempt to identify players from the data.
              </p>
            </div>
          ) : (
            <>
              <div className="bvFormGroup">
                <label htmlFor="opponent">Opponent name (team or player)</label>
                <input
                  id="opponent"
                  type="text"
                  list="opponents"
                  value={opponentName}
                  onChange={(e) => setOpponentName(e.target.value)}
                  placeholder="e.g., John Smith or Central High"
                  disabled={uploadState === "uploading" || uploadState === "processing"}
                  className="bvInput"
                />
                <datalist id="opponents">
                  {opponents.map((opp) => (
                    <option key={opp.id} value={opp.name} />
                  ))}
                </datalist>
              </div>

              <div className="bvFormGroup">
                <label htmlFor="context">Additional context (optional)</label>
                <input
                  id="context"
                  type="text"
                  value={opponentContext}
                  onChange={(e) => setOpponentContext(e.target.value)}
                  placeholder="e.g., Starting RHP, Division rival"
                  disabled={uploadState === "uploading" || uploadState === "processing"}
                  className="bvInput"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 4: Data Preview */}
      {preview && preview.rows.length > 0 && (
        <div className="card bvUploadSection bvAnimSlideUp">
          <h2>4. Data Preview</h2>
          <div className="bvPreviewTable">
            <table>
              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i}>
                    {preview.headers.map((header) => (
                      <td key={header}>{String(row[header] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rowCount > 10 && (
            <p className="bvMuted" style={{ marginTop: 8 }}>
              Showing 10 of {preview.rowCount} rows
            </p>
          )}
          {preview.errors.length > 0 && (
            <div className="bvWarning" style={{ marginTop: 16 }}>
              <AlertCircle size={16} />
              <span>
                {preview.errors.length} parsing warning(s). Data may be
                incomplete.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bvError bvAnimSlideUp">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Processing Status */}
      {(uploadState === "processing" || uploadState === "success") && (
        <div
          className={`bvStatus ${uploadState === "success" ? "bvStatusSuccess" : ""} bvAnimSlideUp`}
        >
          {uploadState === "processing" ? (
            <Loader2 size={20} className="bvSpinner" />
          ) : (
            <Check size={20} />
          )}
          <span>{processingStatus}</span>
        </div>
      )}

      {/* Step 5: Upload Button */}
      {selectedFile && uploadState !== "success" && (
        <div className="bvUploadActions bvAnimSlideUp">
          <button
            className="btn btnPrimary btnLarge"
            onClick={handleUpload}
            disabled={uploadState === "uploading" || uploadState === "processing"}
          >
            {uploadState === "uploading" ? (
              <>
                <Loader2 size={18} className="bvSpinner" />
                Uploading...
              </>
            ) : uploadState === "processing" ? (
              <>
                <Loader2 size={18} className="bvSpinner" />
                Processing with AI...
              </>
            ) : (
              <>
                <Upload size={18} />
                Upload & Analyze with AI
              </>
            )}
          </button>
        </div>
      )}

      {/* Success Actions */}
      {uploadState === "success" && uploadedFileId && (
        <div className="bvSuccessActions bvAnimSlideUp">
          <button
            className="btn btnPrimary"
            onClick={() => router.push(`/app/team-mode/files/${uploadedFileId}`)}
          >
            View File Details
          </button>
          <button
            className="btn btnSecondary"
            onClick={() => {
              setSelectedFile(null);
              setPreview(null);
              setUploadState("idle");
              setPlayerUserId("");
              setOpponentName("");
              setOpponentContext("");
              setUploadedFileId(null);
              setProcessingStatus("");
            }}
          >
            Upload Another File
          </button>
        </div>
      )}

      <style jsx>{`
        .bvUploadPage {
          max-width: 800px;
          margin: 0 auto;
          padding-bottom: 40px;
        }

        .bvPageHeader {
          margin-bottom: 32px;
        }

        .bvPageHeader h1 {
          margin: 0 0 8px;
        }

        .bvUploadSection {
          margin-bottom: 24px;
          padding: 24px;
        }

        .bvUploadSection h2 {
          font-size: 16px;
          margin: 0 0 16px;
          color: var(--muted);
        }

        .bvCategorySelector {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .bvCategoryOption {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .bvCategoryOption:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .bvCategoryOption.bvActive {
          background: rgba(99, 179, 255, 0.1);
          border-color: var(--primary);
        }

        .bvCategoryOption input {
          display: none;
        }

        .bvCategoryOption svg {
          flex-shrink: 0;
          color: var(--muted);
        }

        .bvCategoryOption.bvActive svg {
          color: var(--primary);
        }

        .bvCategoryOption div {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .bvCategoryOption strong {
          font-size: 15px;
        }

        .bvCategoryOption span {
          font-size: 13px;
          color: var(--muted);
        }

        .bvDropZone {
          border: 2px dashed var(--border);
          border-radius: 12px;
          padding: 48px 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .bvDropZone:hover {
          border-color: var(--primary);
          background: rgba(99, 179, 255, 0.05);
        }

        .bvDropZone svg {
          color: var(--muted);
          margin-bottom: 16px;
        }

        .bvDropZone p {
          margin: 0 0 8px;
          font-size: 15px;
        }

        .bvDropZone.bvHasFile {
          padding: 16px 24px;
          border-style: solid;
        }

        .bvSelectedFile {
          display: flex;
          align-items: center;
          gap: 16px;
          text-align: left;
        }

        .bvSelectedFile svg {
          margin-bottom: 0;
          color: var(--primary);
        }

        .bvSelectedFile div {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .bvSelectedFile strong {
          font-size: 15px;
        }

        .bvSelectedFile span {
          font-size: 13px;
          color: var(--muted);
        }

        .bvFormGroup {
          margin-bottom: 16px;
        }

        .bvFormGroup:last-child {
          margin-bottom: 0;
        }

        .bvFormGroup label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          font-weight: 500;
        }

        .bvOptional {
          font-weight: 400;
          color: var(--muted);
          font-size: 12px;
        }

        .bvHelpText {
          margin: 8px 0 0;
          font-size: 13px;
          color: var(--muted);
          line-height: 1.4;
        }

        .bvSelect,
        .bvInput {
          width: 100%;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text);
          font-size: 15px;
        }

        .bvSelect:focus,
        .bvInput:focus {
          outline: none;
          border-color: var(--primary);
        }

        .bvPreviewTable {
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .bvPreviewTable table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .bvPreviewTable th,
        .bvPreviewTable td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bvPreviewTable th {
          background: rgba(255, 255, 255, 0.05);
          font-weight: 600;
        }

        .bvPreviewTable tr:last-child td {
          border-bottom: none;
        }

        .bvWarning {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: rgba(255, 200, 0, 0.1);
          border-radius: 8px;
          color: #ffc800;
          font-size: 13px;
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

        .bvStatus {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: rgba(99, 179, 255, 0.1);
          border: 1px solid rgba(99, 179, 255, 0.3);
          border-radius: 12px;
          color: var(--primary);
          margin-bottom: 24px;
        }

        .bvStatusSuccess {
          background: rgba(0, 200, 83, 0.1);
          border-color: rgba(0, 200, 83, 0.3);
          color: #00c853;
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

        .bvUploadActions {
          text-align: center;
        }

        .btnLarge {
          padding: 16px 32px;
          font-size: 16px;
        }

        .bvSuccessActions {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        @media (max-width: 640px) {
          .bvCategoryOption {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .bvSuccessActions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

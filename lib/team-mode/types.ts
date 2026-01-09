// Team Mode Database Types

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type InsightType = "strength" | "weakness" | "trend" | "recommendation" | "alert" | "tendency";
export type ReportCategory = "own_team" | "opponent";
export type ReportType = "player_assessment" | "season_review" | "opponent_team" | "opponent_player" | "matchup" | "progress_report" | "tendency_report";
export type ReportStatus = "draft" | "final" | "archived";
export type OpponentType = "team" | "player";

export interface PerformanceDataFile {
  id: string;
  team_id: string;
  uploader_user_id: string;
  player_user_id: string | null;
  is_opponent_data: boolean;
  opponent_name: string | null;
  file_name: string;
  storage_path: string;
  file_type: "csv" | "xlsx" | "xls";
  row_count: number;
  detected_columns: Record<string, unknown>;
  metadata: Record<string, unknown>;
  processing_status: ProcessingStatus;
  processed_at: string | null;
  created_at: string;
}

export interface PerformanceMetric {
  id: string;
  data_file_id: string;
  player_user_id: string | null;
  is_opponent_data: boolean;
  opponent_name: string | null;
  metric_date: string | null;
  raw_data: Record<string, unknown>;
  ai_interpreted_data: Record<string, unknown>;
  aggregated_metrics: Record<string, unknown>;
  created_at: string;
}

export interface DataInsight {
  id: string;
  team_id: string;
  player_user_id: string | null;
  is_opponent_insight: boolean;
  opponent_name: string | null;
  data_file_id: string | null;
  insight_type: InsightType;
  title: string;
  description: string;
  confidence_score: number;
  supporting_data: Record<string, unknown>;
  action_items: string[];
  created_by_ai: boolean;
  dismissed_at: string | null;
  created_at: string;
}

export interface Opponent {
  id: string;
  team_id: string;
  opponent_type: OpponentType;
  name: string;
  sport_context: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScoutingReport {
  id: string;
  team_id: string;
  creator_user_id: string;
  report_category: ReportCategory;
  player_user_id: string | null;
  opponent_name: string | null;
  opponent_id: string | null;
  report_type: ReportType;
  game_date: string | null;
  title: string;
  summary: string | null;
  content_sections: Record<string, unknown>;
  ai_generated_content: Record<string, unknown>;
  key_metrics: Record<string, unknown>;
  status: ReportStatus;
  shared_with_player: boolean;
  viewed_by_player_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScoutingReportDataSource {
  id: string;
  report_id: string;
  data_file_id: string;
  metric_ids: string[];
  created_at: string;
}

// Extended types with relations

export interface PerformanceDataFileWithPlayer extends PerformanceDataFile {
  player?: {
    user_id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  uploader?: {
    user_id: string;
    display_name: string | null;
  } | null;
}

export interface ScoutingReportWithRelations extends ScoutingReport {
  player?: {
    user_id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  creator?: {
    user_id: string;
    display_name: string | null;
  } | null;
  opponent?: Opponent | null;
  data_sources?: ScoutingReportDataSource[];
}

export interface DataInsightWithRelations extends DataInsight {
  player?: {
    user_id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  data_file?: PerformanceDataFile | null;
}

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseFile, calculateAggregates, type ParsedData } from "./parse";
import {
  interpretColumns,
  extractRowData,
  generateInsights,
  type ColumnInterpretation,
  type InsightResult,
} from "@/lib/ai/openai";

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

export type ProcessingResult = {
  success: boolean;
  fileId: string;
  status: ProcessingStatus;
  rowCount: number;
  insightCount: number;
  errors: string[];
};

/**
 * Process an uploaded performance data file
 * This is the main 8-step pipeline
 */
export async function processPerformanceFile(
  fileId: string,
  options?: {
    onProgress?: (step: number, message: string) => void;
  }
): Promise<ProcessingResult> {
  const supabase = createSupabaseAdminClient();
  const errors: string[] = [];
  let insightCount = 0;

  const progress = options?.onProgress || (() => {});

  try {
    // Step 1: Get file record
    progress(1, "Loading file information...");

    const { data: fileRecord, error: fileError } = await supabase
      .from("performance_data_files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !fileRecord) {
      throw new Error(`File not found: ${fileError?.message || "Unknown error"}`);
    }

    // Update status to processing
    await supabase
      .from("performance_data_files")
      .update({ processing_status: "processing" })
      .eq("id", fileId);

    // Step 2: Download and parse file
    progress(2, "Downloading and parsing file...");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("performance-data")
      .download(fileRecord.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const buffer = await fileData.arrayBuffer();
    const parsedData: ParsedData = parseFile(
      buffer,
      fileRecord.file_type as "csv" | "xlsx" | "xls"
    );

    if (parsedData.errors.length > 0) {
      errors.push(...parsedData.errors);
    }

    if (parsedData.rows.length === 0) {
      throw new Error("No data rows found in file");
    }

    // Step 3: AI Column Interpretation
    progress(3, "Analyzing column structure with AI...");

    const sampleRows = parsedData.rows.slice(0, 20);
    const columnInterpretation = await interpretColumns(
      parsedData.headers,
      sampleRows,
      {
        dataCategory: fileRecord.is_opponent_data ? "opponent" : "own_team",
        playerOrOpponentName:
          fileRecord.opponent_name ||
          (await getPlayerName(supabase, fileRecord.player_user_id)),
      }
    );

    // Step 4: Store interpretation
    progress(4, "Storing AI interpretation...");

    await supabase
      .from("performance_data_files")
      .update({
        detected_columns: columnInterpretation,
        row_count: parsedData.rowCount,
        metadata: {
          ...((fileRecord.metadata as Record<string, unknown>) || {}),
          detected_sport: columnInterpretation.detected_sport,
          interpretation_confidence: columnInterpretation.confidence,
          data_quality_notes: columnInterpretation.data_quality_notes,
        },
      })
      .eq("id", fileId);

    // Step 5: Process rows (batch for efficiency)
    progress(5, `Processing ${parsedData.rowCount} data rows...`);

    const batchSize = 10;
    const allMetrics: Array<{
      data_file_id: string;
      player_user_id: string | null;
      is_opponent_data: boolean;
      opponent_name: string | null;
      metric_date: string | null;
      raw_data: Record<string, unknown>;
      ai_interpreted_data: Record<string, unknown>;
    }> = [];

    for (let i = 0; i < parsedData.rows.length; i += batchSize) {
      const batch = parsedData.rows.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (row) => {
          try {
            const extracted = await extractRowData(
              row,
              columnInterpretation.column_interpretations
            );

            return {
              data_file_id: fileId,
              player_user_id: fileRecord.is_opponent_data
                ? null
                : fileRecord.player_user_id,
              is_opponent_data: fileRecord.is_opponent_data,
              opponent_name: fileRecord.opponent_name,
              metric_date: extracted.date,
              raw_data: row,
              ai_interpreted_data: {
                metrics: extracted.metrics,
                calculated_metrics: extracted.calculated_metrics,
                confidence: extracted.confidence,
                notes: extracted.notes,
              },
            };
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            errors.push(`Row processing error: ${errorMsg}`);
            return {
              data_file_id: fileId,
              player_user_id: fileRecord.is_opponent_data
                ? null
                : fileRecord.player_user_id,
              is_opponent_data: fileRecord.is_opponent_data,
              opponent_name: fileRecord.opponent_name,
              metric_date: null,
              raw_data: row,
              ai_interpreted_data: { error: errorMsg },
            };
          }
        })
      );

      allMetrics.push(...batchResults);
    }

    // Insert all metrics
    const { error: insertError } = await supabase
      .from("performance_metrics")
      .insert(allMetrics);

    if (insertError) {
      errors.push(`Failed to insert metrics: ${insertError.message}`);
    }

    // Step 6: Calculate aggregates
    progress(6, "Calculating aggregate statistics...");

    const aggregates = calculateAggregates(parsedData.rows, parsedData.headers);

    // Also calculate aggregates from AI-interpreted data
    const interpretedAggregates = calculateInterpretedAggregates(allMetrics);

    // Step 7: Generate insights
    progress(7, "Generating AI insights...");

    try {
      const insightsResult = await generateInsights(
        {
          raw_aggregates: aggregates,
          interpreted_aggregates: interpretedAggregates,
          column_interpretations: columnInterpretation.column_interpretations,
          recommended_metrics: columnInterpretation.recommended_metrics,
        },
        columnInterpretation.column_interpretations,
        {
          dataCategory: fileRecord.is_opponent_data ? "opponent" : "own_team",
          playerOrOpponentName:
            fileRecord.opponent_name ||
            (await getPlayerName(supabase, fileRecord.player_user_id)) ||
            "Unknown",
          rowCount: parsedData.rowCount,
        }
      );

      // Store insights
      const insightsToInsert = insightsResult.insights.map(
        (insight: InsightResult) => ({
          team_id: fileRecord.team_id,
          player_user_id: fileRecord.is_opponent_data
            ? null
            : fileRecord.player_user_id,
          is_opponent_insight: fileRecord.is_opponent_data,
          opponent_name: fileRecord.opponent_name,
          data_file_id: fileId,
          insight_type: insight.type,
          title: insight.title.slice(0, 100),
          description: insight.description.slice(0, 500),
          confidence_score: insight.confidence,
          supporting_data: insight.supporting_data,
          action_items: insight.action_items,
          created_by_ai: true,
        })
      );

      const { error: insightError } = await supabase
        .from("data_insights")
        .insert(insightsToInsert);

      if (insightError) {
        errors.push(`Failed to insert insights: ${insightError.message}`);
      } else {
        insightCount = insightsToInsert.length;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Unknown error";
      errors.push(`Insight generation error: ${errorMsg}`);
    }

    // Step 8: Complete processing
    progress(8, "Finalizing...");

    const successRate =
      allMetrics.filter((m) => !("error" in (m.ai_interpreted_data as Record<string, unknown>))).length /
      allMetrics.length;

    if (successRate < 0.3) {
      // Less than 30% success rate = failed
      await supabase
        .from("performance_data_files")
        .update({
          processing_status: "failed",
          processed_at: new Date().toISOString(),
          metadata: {
            ...((fileRecord.metadata as Record<string, unknown>) || {}),
            errors,
            success_rate: successRate,
          },
        })
        .eq("id", fileId);

      return {
        success: false,
        fileId,
        status: "failed",
        rowCount: parsedData.rowCount,
        insightCount: 0,
        errors,
      };
    }

    await supabase
      .from("performance_data_files")
      .update({
        processing_status: "completed",
        processed_at: new Date().toISOString(),
        metadata: {
          ...((fileRecord.metadata as Record<string, unknown>) || {}),
          errors: errors.length > 0 ? errors : undefined,
          success_rate: successRate,
          aggregates: interpretedAggregates,
        },
      })
      .eq("id", fileId);

    return {
      success: true,
      fileId,
      status: "completed",
      rowCount: parsedData.rowCount,
      insightCount,
      errors,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unknown error";
    errors.push(errorMsg);

    // Mark as failed
    await supabase
      .from("performance_data_files")
      .update({
        processing_status: "failed",
        processed_at: new Date().toISOString(),
        metadata: { errors },
      })
      .eq("id", fileId);

    return {
      success: false,
      fileId,
      status: "failed",
      rowCount: 0,
      insightCount: 0,
      errors,
    };
  }
}

/**
 * Get player display name
 */
async function getPlayerName(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string | null
): Promise<string | null> {
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", userId)
    .single();

  if (!data) return null;

  return (
    data.display_name ||
    [data.first_name, data.last_name].filter(Boolean).join(" ") ||
    null
  );
}

/**
 * Calculate aggregates from AI-interpreted data
 */
function calculateInterpretedAggregates(
  metrics: Array<{
    ai_interpreted_data: Record<string, unknown>;
  }>
): Record<string, unknown> {
  const allMetricValues: Record<string, number[]> = {};

  for (const metric of metrics) {
    const interpreted = metric.ai_interpreted_data;
    if ("error" in interpreted) continue;

    const metricsData = (interpreted.metrics || {}) as Record<string, number>;
    const calculatedData = (interpreted.calculated_metrics || {}) as Record<string, number>;

    for (const [key, value] of Object.entries({
      ...metricsData,
      ...calculatedData,
    })) {
      if (typeof value === "number" && !isNaN(value)) {
        if (!allMetricValues[key]) allMetricValues[key] = [];
        allMetricValues[key].push(value);
      }
    }
  }

  const aggregates: Record<string, {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
  }> = {};

  for (const [key, values] of Object.entries(allMetricValues)) {
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      aggregates[key] = {
        count: values.length,
        sum,
        avg: sum / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
  }

  return aggregates;
}

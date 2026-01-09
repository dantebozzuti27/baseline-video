import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseFile, calculateAggregates, type ParsedData } from "./parse";
import {
  interpretColumns,
  generateInsights,
  type InsightResult,
} from "@/lib/ai/openai";
import { generateBenchmarkContext, compareToLeague } from "@/lib/ai/baseball-data";

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

    // Step 5: Store rows directly (NO per-row AI - much faster!)
    progress(5, `Storing ${parsedData.rowCount} data rows...`);

    // Detect date column from interpretation
    const dateColumn = Object.entries(columnInterpretation.column_interpretations)
      .find(([, interp]) => interp.data_type === "date")?.[0];

    // Map rows to metrics (no AI call per row - just use column interpretation)
    const allMetrics = parsedData.rows.map((row) => {
      // Extract date if we found a date column
      let metricDate: string | null = null;
      if (dateColumn && row[dateColumn]) {
        const dateVal = row[dateColumn];
        if (typeof dateVal === "string") {
          // Try to parse as date
          const parsed = new Date(dateVal);
          if (!isNaN(parsed.getTime())) {
            metricDate = parsed.toISOString().split("T")[0];
          }
        }
      }

      return {
        data_file_id: fileId,
        player_user_id: fileRecord.is_opponent_data ? null : fileRecord.player_user_id,
        is_opponent_data: fileRecord.is_opponent_data,
        opponent_name: fileRecord.opponent_name,
        metric_date: metricDate,
        raw_data: row,
        ai_interpreted_data: {}, // Column interpretation provides meaning
      };
    });

    // Batch insert for speed (1000 at a time)
    const batchSize = 1000;
    for (let i = 0; i < allMetrics.length; i += batchSize) {
      const batch = allMetrics.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("performance_metrics")
        .insert(batch);

      if (insertError) {
        errors.push(`Failed to insert metrics batch: ${insertError.message}`);
      }
    }

    // Step 6: Calculate aggregates from raw data
    progress(6, "Calculating aggregate statistics...");

    const aggregates = calculateAggregates(parsedData.rows, parsedData.headers);

    // Step 7: Generate insights with league benchmarks
    progress(7, "Generating AI insights with league benchmarks...");

    // Detect if this is baseball data and add benchmarks
    const isBaseball = columnInterpretation.detected_sport?.toLowerCase().includes("baseball") ||
                       columnInterpretation.detected_sport?.toLowerCase().includes("softball");
    
    // Calculate league comparisons for numeric aggregates
    const numericAggregates: Record<string, number> = {};
    for (const [key, value] of Object.entries(aggregates)) {
      if (typeof value === "object" && value && "avg" in value) {
        numericAggregates[key] = (value as { avg: number }).avg;
      }
    }
    
    const leagueComparisons = isBaseball ? compareToLeague(numericAggregates, "ncaa") : [];
    const benchmarkContext = isBaseball ? generateBenchmarkContext(Object.keys(numericAggregates), "ncaa") : "";

    try {
      const insightsResult = await generateInsights(
        {
          aggregates,
          column_interpretations: columnInterpretation.column_interpretations,
          recommended_metrics: columnInterpretation.recommended_metrics,
          sample_rows: parsedData.rows.slice(0, 10),
          league_comparisons: leagueComparisons,
          benchmark_context: benchmarkContext,
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

    await supabase
      .from("performance_data_files")
      .update({
        processing_status: "completed",
        processed_at: new Date().toISOString(),
        metadata: {
          ...((fileRecord.metadata as Record<string, unknown>) || {}),
          errors: errors.length > 0 ? errors : undefined,
          aggregates,
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


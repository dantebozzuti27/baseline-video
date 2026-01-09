import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateReport, type ColumnInterpretation, type InsightResult } from "@/lib/ai/openai";
import { enhanceReportProse } from "@/lib/ai/anthropic";

export const maxDuration = 120; // 2 minute timeout

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const adminSupabase = createSupabaseAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.role !== "coach") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const {
      reportType,
      reportCategory,
      title,
      playerUserId,
      opponentName,
      opponentId,
      gameDate,
      focusAreas,
      fileIds,
    } = body;

    if (!reportType || !reportCategory || !title) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!fileIds || fileIds.length === 0) {
      return NextResponse.json(
        { error: "At least one data file is required" },
        { status: 400 }
      );
    }

    // Get files and their data
    const { data: files, error: filesError } = await supabase
      .from("performance_data_files")
      .select("id, detected_columns, metadata, player_user_id, opponent_name")
      .in("id", fileIds)
      .eq("team_id", profile.team_id);

    if (filesError || !files || files.length === 0) {
      return NextResponse.json({ error: "Files not found" }, { status: 404 });
    }

    // Get aggregated metrics from files
    const aggregatedMetrics: Record<string, unknown> = {};
    let columnInterpretations: Record<string, ColumnInterpretation> = {};

    for (const file of files) {
      const detected = file.detected_columns as { 
        column_interpretations?: Record<string, ColumnInterpretation>;
      };
      if (detected?.column_interpretations) {
        columnInterpretations = {
          ...columnInterpretations,
          ...detected.column_interpretations,
        };
      }

      const metadata = file.metadata as { aggregates?: Record<string, unknown> };
      if (metadata?.aggregates) {
        for (const [key, value] of Object.entries(metadata.aggregates)) {
          if (!aggregatedMetrics[key]) {
            aggregatedMetrics[key] = value;
          }
        }
      }
    }

    // Get existing insights for context
    const { data: insights } = await supabase
      .from("data_insights")
      .select("insight_type, title, description, confidence_score, supporting_data, action_items")
      .in("data_file_id", fileIds)
      .is("dismissed_at", null);

    const existingInsights: InsightResult[] = (insights || []).map((i) => ({
      type: i.insight_type as InsightResult["type"],
      title: i.title,
      description: i.description,
      confidence: i.confidence_score,
      supporting_data: i.supporting_data as Record<string, unknown>,
      action_items: i.action_items as string[],
    }));

    // Get player name if own_team report
    let playerName: string | undefined;
    if (reportCategory === "own_team" && playerUserId) {
      const { data: player } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name")
        .eq("user_id", playerUserId)
        .single();

      playerName =
        player?.display_name ||
        [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
        undefined;
    }

    // Generate report with OpenAI
    const openaiReport = await generateReport(
      aggregatedMetrics,
      columnInterpretations,
      existingInsights,
      {
        reportType,
        reportCategory,
        playerName,
        opponentName,
        dateRange: gameDate,
        focusAreas: focusAreas || [],
      }
    );

    // Enhance with Claude
    let enhancedReport: Record<string, unknown>;
    try {
      enhancedReport = await enhanceReportProse(openaiReport);
    } catch {
      console.error("Claude enhancement failed, using OpenAI output");
      enhancedReport = openaiReport;
    }

    // Create report record
    const { data: report, error: insertError } = await adminSupabase
      .from("scouting_reports")
      .insert({
        team_id: profile.team_id,
        creator_user_id: user.id,
        report_category: reportCategory,
        player_user_id: reportCategory === "own_team" ? playerUserId : null,
        opponent_name: reportCategory === "opponent" ? opponentName : null,
        opponent_id: reportCategory === "opponent" ? opponentId : null,
        report_type: reportType,
        game_date: gameDate || null,
        title,
        summary: (enhancedReport as { executive_summary?: string }).executive_summary || "",
        content_sections: enhancedReport,
        ai_generated_content: {
          openai: openaiReport,
          claude_enhanced: enhancedReport,
        },
        key_metrics: (enhancedReport as { key_metrics_table?: unknown }).key_metrics_table || {},
        status: "draft",
      })
      .select()
      .single();

    if (insertError || !report) {
      console.error("Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create report" },
        { status: 500 }
      );
    }

    // Link data sources
    const dataSources = fileIds.map((fileId: string) => ({
      report_id: report.id,
      data_file_id: fileId,
    }));

    await adminSupabase
      .from("scouting_report_data_sources")
      .insert(dataSources);

    return NextResponse.json({
      success: true,
      reportId: report.id,
      report,
    });
  } catch (error) {
    console.error("Generate report error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate report",
      },
      { status: 500 }
    );
  }
}

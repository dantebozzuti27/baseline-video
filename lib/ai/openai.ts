import OpenAI from "openai";

// Lazy-load OpenAI client to avoid build-time errors
let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

export type ColumnInterpretation = {
  interpreted_as: string;
  data_type: "date" | "number" | "text" | "boolean";
  description: string;
  is_key_metric: boolean;
  sample_values: string[];
};

export type ColumnInterpretationResult = {
  detected_sport: string;
  confidence: number;
  column_interpretations: Record<string, ColumnInterpretation>;
  recommended_metrics: Array<{
    name: string;
    description: string;
    columns_used: string[];
  }>;
  data_quality_notes: string[];
  suggested_report_sections: string[];
};

export type RowExtractionResult = {
  date: string | null;
  opponent_info: {
    name: string | null;
    context: string | null;
  };
  metrics: Record<string, number | string | boolean>;
  calculated_metrics: Record<string, number>;
  confidence: number;
  notes: string;
};

export type InsightResult = {
  type: "strength" | "weakness" | "trend" | "recommendation" | "tendency" | "alert";
  title: string;
  description: string;
  confidence: number;
  supporting_data: Record<string, unknown>;
  action_items: string[];
};

export type ReportGenerationResult = {
  executive_summary: string;
  dynamic_sections: Array<{
    section_title: string;
    section_type: "strength" | "weakness" | "trend" | "analysis" | "recommendation";
    content: string;
    key_points: Array<{
      point: string;
      supporting_data: Record<string, unknown>;
      importance: "high" | "medium" | "low";
    }>;
  }>;
  key_metrics_table: {
    detected_metrics: Array<{
      metric_name: string;
      value: number | string;
      context: string;
      visualization_type: "number" | "chart" | "comparison";
    }>;
  };
  strengths: Array<{
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    supporting_stats: Record<string, unknown>;
  }>;
  areas_for_development: Array<{
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    supporting_stats: Record<string, unknown>;
    recommended_actions: string[];
  }>;
  action_plan: Array<{
    category: string;
    specific_actions: string[];
    success_metrics: string[];
    timeline: string;
  }>;
  additional_observations: string;
  suggested_visualizations: Array<{
    chart_type: "line" | "bar" | "radar" | "scatter" | "heatmap";
    title: string;
    metrics_to_plot: string[];
    insights: string;
  }>;
};

/**
 * Interpret CSV columns using AI
 */
export async function interpretColumns(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  context: {
    dataCategory: "own_team" | "opponent";
    sport?: string;
    playerOrOpponentName?: string;
  }
): Promise<ColumnInterpretationResult> {
  const prompt = `You are analyzing a sports performance data CSV file. Your job is to understand what each column represents, even if the headers are unclear or use non-standard names.

CSV Headers:
${JSON.stringify(headers)}

Sample Data (first 5 rows):
${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

Context:
- Data Category: ${context.dataCategory}
- Sport: ${context.sport || "unknown"}
- ${context.dataCategory === "own_team" ? `Player: ${context.playerOrOpponentName || "unknown"}` : `Opponent: ${context.playerOrOpponentName || "unknown"}`}

Analyze this data and return a JSON object with:

{
  "detected_sport": "baseball|softball|tennis|golf|basketball|unknown",
  "confidence": 0.0-1.0,
  "column_interpretations": {
    "original_column_name": {
      "interpreted_as": "standardized name (e.g., 'batting_average', 'opponent_name', 'game_date')",
      "data_type": "date|number|text|boolean",
      "description": "what this column represents",
      "is_key_metric": true|false,
      "sample_values": ["example1", "example2"]
    }
  },
  "recommended_metrics": [
    {
      "name": "metric name",
      "description": "why this is important",
      "columns_used": ["col1", "col2"]
    }
  ],
  "data_quality_notes": ["any issues or observations"],
  "suggested_report_sections": [
    "section name that would be relevant for this data"
  ]
}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from OpenAI");
  
  return JSON.parse(content) as ColumnInterpretationResult;
}

/**
 * Extract structured data from a single row
 */
export async function extractRowData(
  row: Record<string, unknown>,
  columnInterpretations: Record<string, ColumnInterpretation>
): Promise<RowExtractionResult> {
  const prompt = `Given this data row and column interpretations, extract structured metrics.

Row Data:
${JSON.stringify(row)}

Column Interpretations:
${JSON.stringify(columnInterpretations)}

Extract and return:
{
  "date": "YYYY-MM-DD or null",
  "opponent_info": {
    "name": "string or null",
    "context": "string or null"
  },
  "metrics": {
    "metric_name": value,
    ...all interpreted metrics
  },
  "calculated_metrics": {
    ...any derived metrics (e.g., batting avg from hits/at-bats)
  },
  "confidence": 0.0-1.0,
  "notes": "any interpretation issues"
}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from OpenAI");
  
  return JSON.parse(content) as RowExtractionResult;
}

/**
 * Generate insights from aggregated data
 */
export async function generateInsights(
  aggregatedMetrics: Record<string, unknown>,
  columnInterpretations: Record<string, ColumnInterpretation>,
  context: {
    dataCategory: "own_team" | "opponent";
    playerOrOpponentName: string;
    rowCount: number;
  }
): Promise<{ insights: InsightResult[] }> {
  const focusArea = context.dataCategory === "own_team"
    ? `For own team data, focus on:
- Strengths to leverage
- Weaknesses to address
- Trends over time
- Specific recommendations`
    : `For opponent data, focus on:
- Tendencies to exploit
- Patterns to prepare for
- Strategic recommendations
- Matchup advantages`;

  const prompt = `You've analyzed ${context.rowCount} rows of performance data.

Data Summary:
${JSON.stringify(aggregatedMetrics, null, 2)}

Column Interpretations:
${JSON.stringify(columnInterpretations, null, 2)}

Data Category: ${context.dataCategory}
${context.dataCategory === "own_team" ? `Player: ${context.playerOrOpponentName}` : `Opponent: ${context.playerOrOpponentName}`}

${focusArea}

Generate 5-10 actionable insights. Return JSON array of insights:
{
  "insights": [
    {
      "type": "strength|weakness|trend|recommendation|tendency|alert",
      "title": "short headline",
      "description": "detailed explanation",
      "confidence": 0.0-1.0,
      "supporting_data": {relevant metrics},
      "action_items": ["specific action 1", "specific action 2"]
    }
  ]
}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from OpenAI");
  
  return JSON.parse(content) as { insights: InsightResult[] };
}

/**
 * Generate a scouting report
 */
export async function generateReport(
  aggregatedMetrics: Record<string, unknown>,
  columnInterpretations: Record<string, ColumnInterpretation>,
  existingInsights: InsightResult[],
  context: {
    reportType: string;
    reportCategory: "own_team" | "opponent";
    playerName?: string;
    opponentName?: string;
    dateRange?: string;
    focusAreas: string[];
  }
): Promise<ReportGenerationResult> {
  let prompt: string;

  if (context.reportCategory === "own_team") {
    prompt = `You are an expert coach analyzing player performance data.

Player: ${context.playerName || "Unknown"}
Report Type: ${context.reportType}
Time Period: ${context.dateRange || "All available data"}
Focus Areas: ${context.focusAreas.join(", ")}

Performance Data Summary:
${JSON.stringify(aggregatedMetrics, null, 2)}

AI Column Interpretations:
${JSON.stringify(columnInterpretations, null, 2)}

Raw Insights Previously Generated:
${JSON.stringify(existingInsights, null, 2)}

Based on this data, create a comprehensive performance report. The data determines what's important - don't assume standard metrics. Work with whatever columns were detected.

Return JSON in this structure:

{
  "executive_summary": "2-3 paragraph overview of player's performance",
  
  "dynamic_sections": [
    {
      "section_title": "determine title based on data (e.g., 'Batting Performance', 'Serve Analysis', etc.)",
      "section_type": "strength|weakness|trend|analysis|recommendation",
      "content": "detailed prose analysis",
      "key_points": [
        {
          "point": "specific finding",
          "supporting_data": {relevant metrics},
          "importance": "high|medium|low"
        }
      ]
    }
  ],
  
  "key_metrics_table": {
    "detected_metrics": [
      {
        "metric_name": "as it appears in data",
        "value": "current value",
        "context": "vs baseline / trend / percentile",
        "visualization_type": "number|chart|comparison"
      }
    ]
  },
  
  "strengths": [
    {
      "title": "specific strength",
      "description": "explanation with data",
      "impact": "high|medium|low",
      "supporting_stats": {metrics}
    }
  ],
  
  "areas_for_development": [
    {
      "title": "specific area",
      "description": "what needs work and why",
      "priority": "high|medium|low",
      "supporting_stats": {metrics},
      "recommended_actions": ["action 1", "action 2"]
    }
  ],
  
  "action_plan": [
    {
      "category": "area of focus",
      "specific_actions": ["action 1", "action 2"],
      "success_metrics": ["how to measure improvement"],
      "timeline": "suggested timeframe"
    }
  ],
  
  "additional_observations": "any other relevant insights",
  
  "suggested_visualizations": [
    {
      "chart_type": "line|bar|radar|scatter|heatmap",
      "title": "chart title",
      "metrics_to_plot": ["metric1", "metric2"],
      "insights": "what this chart should show"
    }
  ]
}

IMPORTANT: Let the data dictate the structure. If the data is about tennis serves, don't write about batting. Create sections that make sense for whatever sport/activity this data represents.`;
  } else {
    prompt = `You are creating a scouting report on an opposing team/player.

Opponent: ${context.opponentName || "Unknown"}
Report Type: ${context.reportType}
Game Date: ${context.dateRange || "Not specified"}

Opponent Performance Data:
${JSON.stringify(aggregatedMetrics, null, 2)}

AI Column Interpretations:
${JSON.stringify(columnInterpretations, null, 2)}

Existing Insights:
${JSON.stringify(existingInsights, null, 2)}

Focus: Identify tendencies, patterns, weaknesses to exploit, strengths to prepare for.

Return JSON with the same structure as an own-team report but focused on:
- executive_summary: Overview of opponent's tendencies
- dynamic_sections: Include tendency_analysis, exploitable_weaknesses, dangerous_strengths
- strengths: Opponent strengths to prepare for
- areas_for_development: Weaknesses we can exploit
- action_plan: Strategic game plan
- suggested_visualizations: Charts showing opponent patterns`;
  }

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No response from OpenAI");
  
  return JSON.parse(content) as ReportGenerationResult;
}

export { getOpenAI };

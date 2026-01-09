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
  const prompt = `You are a sports data scientist analyzing performance data. Understand each column and identify what analytics are possible.

## RAW DATA
Headers: ${JSON.stringify(headers)}

Sample Rows (first 5):
${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

Context:
- Category: ${context.dataCategory}
- Sport: ${context.sport || "auto-detect from data"}
- Subject: ${context.playerOrOpponentName || "unknown"}

## ANALYZE AND RETURN:

{
  "detected_sport": "baseball|softball|tennis|golf|basketball|soccer|hockey|volleyball|football|track|swimming|other",
  "confidence": 0.0-1.0,
  "column_interpretations": {
    "original_column_name": {
      "interpreted_as": "standardized metric name",
      "data_type": "date|number|text|boolean",
      "description": "what this measures and why it matters",
      "is_key_metric": true|false,
      "sample_values": ["val1", "val2"]
    }
  },
  "recommended_metrics": [
    {
      "name": "Derived metric name",
      "description": "What insight this provides",
      "columns_used": ["col1", "col2"],
      "formula": "how to calculate (e.g., hits/at_bats)"
    }
  ],
  "key_questions_answerable": [
    "What specific coaching questions can this data answer?"
  ],
  "data_quality_notes": ["Any data issues, missing fields, or anomalies"],
  "suggested_analysis": [
    "Specific analysis to run on this data (e.g., 'Compare performance by count situation')"
  ],
  "data_cleaning_notes": [
    "Any issues with the data that required interpretation or cleaning"
  ],
  "confidence_warnings": [
    "Any reasons the analysis might be less reliable (small sample, inconsistent data, etc.)"
  ]
}

## HANDLING UNSTRUCTURED/MESSY DATA
- Column names may be abbreviated, misspelled, or non-standard - interpret based on values
- Look at the ACTUAL VALUES to understand what a column represents, not just the header
- If a column has mixed data types, note it and decide how to handle
- If values look like codes (1/2/3 or Y/N), try to decode the meaning from context
- Dates may be in various formats - identify the format being used
- Numbers may include commas, dollar signs, or percentages - extract the numeric value
- Empty cells, "N/A", "-", "0", and blank strings all mean different things - be explicit

Return valid JSON only.`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", // Fast model for column interpretation
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
 * Generate insights from aggregated data - Data Scientist approach
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
  const isOwnTeam = context.dataCategory === "own_team";
  
  // Extract benchmark context if provided
  const benchmarkContext = (aggregatedMetrics as Record<string, unknown>).benchmark_context as string || "";
  const leagueComparisons = (aggregatedMetrics as Record<string, unknown>).league_comparisons || [];
  
  const prompt = `You are an elite sports performance data scientist. Analyze this data like you're presenting to a professional coaching staff who needs SPECIFIC, ACTIONABLE intelligence they can use in practice TODAY.

## DATA CONTEXT
- Subject: ${isOwnTeam ? `Player: ${context.playerOrOpponentName}` : `Opponent: ${context.playerOrOpponentName}`}
- Data Type: ${isOwnTeam ? "Own Team Performance Data" : "Opponent Scouting Data"}  
- Sample Size: ${context.rowCount} observations

${benchmarkContext}

## LEAGUE COMPARISONS (pre-calculated)
${JSON.stringify(leagueComparisons, null, 2)}

## RAW STATISTICS
${JSON.stringify(aggregatedMetrics, null, 2)}

## COLUMN MEANINGS
${JSON.stringify(columnInterpretations, null, 2)}

## YOUR ANALYSIS REQUIREMENTS

${isOwnTeam ? `
**OWN PLAYER ANALYSIS - Focus on development:**
1. IDENTIFY PATTERNS: What situations produce best/worst performance? (counts, pitch types, game situations)
2. FIND THE EDGE: What's this player's unfair advantage? Be specific with numbers.
3. EXPOSE WEAKNESSES: What's the glaring hole? Don't sugarcoat - coaches need truth.
4. TREND ANALYSIS: Is performance improving, declining, or inconsistent? Over what timeframe?
5. PRACTICE PRESCRIPTION: What SPECIFIC drill or adjustment would move the needle most?
` : `
**OPPONENT SCOUTING - Focus on exploitation:**
1. TENDENCIES: What does this opponent do 60%+ of the time in specific situations?
2. TELLS: Any patterns that predict what's coming next?
3. WEAKNESSES TO ATTACK: Where do they struggle? Be ruthlessly specific.
4. DANGER ZONES: When are they most dangerous? What to avoid?
5. GAME PLAN: Give me 2-3 specific tactical adjustments to beat this opponent.
`}

## OUTPUT FORMAT
Return 5-8 insights. Each must be:
- SPECIFIC (include exact numbers, percentages, situations)
- ACTIONABLE (coach can implement in next practice/game)
- EVIDENCE-BASED (cite the data that supports this)

{
  "insights": [
    {
      "type": "strength|weakness|trend|recommendation|tendency|alert",
      "title": "Punchy headline with a number (e.g., '73% Success Rate on First-Pitch Fastballs')",
      "description": "2-3 sentences explaining the insight with specific data points. Include context like 'This is above/below average' or 'This represents a 15% improvement'.",
      "confidence": 0.0-1.0,
      "supporting_data": {"metric_name": value, "comparison": "context"},
      "action_items": ["Specific drill: [name] focusing on [specific thing]", "In-game adjustment: [exact tactic]"]
    }
  ]
}

BE BOLD. Coaches don't want hedging - they want clear direction. If the data shows something, say it directly.

## VERIFICATION REQUIREMENTS (CRITICAL)
Before stating ANY number or percentage:
1. SHOW YOUR MATH: State the exact values you're using and how you calculated
2. VERIFY: Double-check that your calculation matches the raw data provided
3. NO HALLUCINATING: If the data doesn't support a claim, don't make it
4. CITE SOURCE: Reference the specific column/metric you're using

Example of GOOD insight:
"73% First-Pitch Strike Rate" 
- Calculation: 22 first-pitch strikes / 30 total first pitches = 0.733
- This is VERIFIED against the raw data showing count=30, sum=22 for the first_pitch_strike column

Example of BAD insight (NEVER DO THIS):
"Player has excellent plate discipline" with no numbers or made-up statistics

## HANDLING MESSY DATA
- If column names are unclear, state your interpretation
- If data has gaps/nulls, note the sample size you're actually using
- If values seem inconsistent, flag it rather than guessing
- Round percentages to 1 decimal place, averages to 3 decimals

Return valid JSON only.`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini", // Fast model for insights
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

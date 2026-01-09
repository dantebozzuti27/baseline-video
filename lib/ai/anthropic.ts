import Anthropic from "@anthropic-ai/sdk";

// Lazy-load Anthropic client to avoid build-time errors
let anthropicInstance: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    anthropicInstance = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicInstance;
}

/**
 * Enhance report prose using Claude
 * Takes structured report JSON and improves the writing quality
 */
export async function enhanceReportProse(
  structuredReport: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const prompt = `You are a professional sports analyst. Take this structured report and enhance the writing.

Structured Analysis:
${JSON.stringify(structuredReport, null, 2)}

Rewrite each section to be:
- Clear and actionable
- Professional but conversational
- Specific with data references
- Focused on what matters for performance
- Free of unnecessary jargon
- Compelling to read

Maintain the exact JSON structure but improve all text content. Return the complete JSON with enhanced text.`;

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  // Extract text content from response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse the JSON from the response - Claude may wrap it in markdown code blocks
  let jsonContent = textBlock.text;
  
  // Remove markdown code blocks if present
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonContent.trim());
  } catch {
    // If parsing fails, return original report
    console.error("Failed to parse Claude response, returning original");
    return structuredReport;
  }
}

/**
 * Generate a concise summary from a detailed report
 */
export async function generateExecutiveSummary(
  reportContent: Record<string, unknown>,
  maxWords: number = 200
): Promise<string> {
  const prompt = `Based on this sports performance report, write a concise executive summary in ${maxWords} words or less.

Report Content:
${JSON.stringify(reportContent, null, 2)}

The summary should:
- Highlight the most important findings
- Include 1-2 specific data points
- End with the primary recommendation
- Be written for a coach who needs quick insights

Return only the summary text, no JSON.`;

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return textBlock.text.trim();
}

/**
 * Rewrite insights in a more actionable tone
 */
export async function rewriteInsights(
  insights: Array<{
    title: string;
    description: string;
    action_items: string[];
  }>
): Promise<
  Array<{
    title: string;
    description: string;
    action_items: string[];
  }>
> {
  const prompt = `Rewrite these sports performance insights to be more actionable and specific.

Original Insights:
${JSON.stringify(insights, null, 2)}

For each insight:
- Make the title punchy and memorable
- Make the description specific with numbers when available
- Ensure action items are concrete and immediately implementable

Return JSON array with same structure:
[
  {
    "title": "improved title",
    "description": "improved description",
    "action_items": ["specific action 1", "specific action 2"]
  }
]`;

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonContent = textBlock.text;
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonContent.trim());
  } catch {
    console.error("Failed to parse Claude insights response, returning original");
    return insights;
  }
}

export { getAnthropic };

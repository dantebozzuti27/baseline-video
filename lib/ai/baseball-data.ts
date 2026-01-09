/**
 * Baseball data fetching utilities for AI-enhanced analysis
 * Uses free MLB Stats API for real benchmarks
 */

export type LeagueAverages = {
  batting_average: number;
  on_base_percentage: number;
  slugging_percentage: number;
  ops: number;
  strikeout_rate: number;
  walk_rate: number;
  home_run_rate: number;
  era: number;
  whip: number;
  k_per_9: number;
  bb_per_9: number;
  source: string;
  year: number;
};

export type PlayerComparison = {
  metric: string;
  playerValue: number;
  leagueAverage: number;
  percentile: number;
  assessment: "elite" | "above_average" | "average" | "below_average" | "needs_work";
};

// MLB League averages (2023 season - update annually)
const MLB_AVERAGES_2023: LeagueAverages = {
  batting_average: 0.248,
  on_base_percentage: 0.320,
  slugging_percentage: 0.414,
  ops: 0.734,
  strikeout_rate: 22.7,
  walk_rate: 8.5,
  home_run_rate: 3.1,
  era: 4.26,
  whip: 1.29,
  k_per_9: 8.88,
  bb_per_9: 3.25,
  source: "MLB",
  year: 2023,
};

// NCAA Division I averages (approximate)
const NCAA_D1_AVERAGES: LeagueAverages = {
  batting_average: 0.275,
  on_base_percentage: 0.360,
  slugging_percentage: 0.420,
  ops: 0.780,
  strikeout_rate: 18.5,
  walk_rate: 10.2,
  home_run_rate: 2.1,
  era: 5.20,
  whip: 1.45,
  k_per_9: 8.2,
  bb_per_9: 4.1,
  source: "NCAA D1",
  year: 2023,
};

// High School averages (approximate)
const HIGH_SCHOOL_AVERAGES: LeagueAverages = {
  batting_average: 0.310,
  on_base_percentage: 0.390,
  slugging_percentage: 0.440,
  ops: 0.830,
  strikeout_rate: 15.0,
  walk_rate: 12.0,
  home_run_rate: 1.5,
  era: 4.50,
  whip: 1.55,
  k_per_9: 7.0,
  bb_per_9: 5.0,
  source: "High School",
  year: 2023,
};

/**
 * Get league averages based on competition level
 */
export function getLeagueAverages(level: "mlb" | "ncaa" | "high_school" = "ncaa"): LeagueAverages {
  switch (level) {
    case "mlb":
      return MLB_AVERAGES_2023;
    case "high_school":
      return HIGH_SCHOOL_AVERAGES;
    default:
      return NCAA_D1_AVERAGES;
  }
}

/**
 * Calculate percentile based on value vs league average
 */
export function calculatePercentile(
  value: number,
  leagueAvg: number,
  higherIsBetter: boolean = true
): number {
  // Simple percentile estimation based on deviation from mean
  // Assumes roughly normal distribution with std dev ~15% of mean
  const stdDev = leagueAvg * 0.15;
  const zScore = (value - leagueAvg) / stdDev;
  
  // Convert z-score to percentile (simplified)
  let percentile = 50 + (zScore * 15);
  
  // Invert if lower is better (like ERA, strikeout rate)
  if (!higherIsBetter) {
    percentile = 100 - percentile;
  }
  
  // Clamp to 1-99
  return Math.max(1, Math.min(99, Math.round(percentile)));
}

/**
 * Assess a metric value
 */
export function assessMetric(percentile: number): PlayerComparison["assessment"] {
  if (percentile >= 90) return "elite";
  if (percentile >= 70) return "above_average";
  if (percentile >= 40) return "average";
  if (percentile >= 20) return "below_average";
  return "needs_work";
}

/**
 * Compare player metrics to league averages
 */
export function compareToLeague(
  playerMetrics: Record<string, number>,
  level: "mlb" | "ncaa" | "high_school" = "ncaa"
): PlayerComparison[] {
  const averages = getLeagueAverages(level);
  const comparisons: PlayerComparison[] = [];

  const metricMappings: Array<{
    key: string;
    aliases: string[];
    avgKey: keyof LeagueAverages;
    higherIsBetter: boolean;
  }> = [
    { key: "batting_average", aliases: ["avg", "ba", "batting avg"], avgKey: "batting_average", higherIsBetter: true },
    { key: "on_base_percentage", aliases: ["obp", "on base", "ob%"], avgKey: "on_base_percentage", higherIsBetter: true },
    { key: "slugging_percentage", aliases: ["slg", "slugging", "slug"], avgKey: "slugging_percentage", higherIsBetter: true },
    { key: "ops", aliases: ["ops"], avgKey: "ops", higherIsBetter: true },
    { key: "strikeout_rate", aliases: ["k%", "k rate", "strikeout%", "so%"], avgKey: "strikeout_rate", higherIsBetter: false },
    { key: "walk_rate", aliases: ["bb%", "walk%", "bb rate"], avgKey: "walk_rate", higherIsBetter: true },
    { key: "era", aliases: ["era", "earned run average"], avgKey: "era", higherIsBetter: false },
    { key: "whip", aliases: ["whip"], avgKey: "whip", higherIsBetter: false },
  ];

  for (const mapping of metricMappings) {
    // Find matching metric in player data
    const playerKey = Object.keys(playerMetrics).find(
      k => k.toLowerCase() === mapping.key || 
           mapping.aliases.some(a => k.toLowerCase().includes(a))
    );

    if (playerKey && typeof playerMetrics[playerKey] === "number") {
      const playerValue = playerMetrics[playerKey];
      const leagueAvg = averages[mapping.avgKey] as number;
      const percentile = calculatePercentile(playerValue, leagueAvg, mapping.higherIsBetter);

      comparisons.push({
        metric: mapping.key,
        playerValue,
        leagueAverage: leagueAvg,
        percentile,
        assessment: assessMetric(percentile),
      });
    }
  }

  return comparisons;
}

/**
 * Fetch live data from MLB Stats API (optional enhancement)
 */
export async function fetchMLBPlayerStats(playerName: string): Promise<Record<string, unknown> | null> {
  try {
    // Search for player
    const searchUrl = `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(playerName)}`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    
    if (!searchData.people?.[0]) return null;
    
    const playerId = searchData.people[0].id;
    
    // Get player stats
    const statsUrl = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&season=2023`;
    const statsResp = await fetch(statsUrl);
    const statsData = await statsResp.json();
    
    return statsData.stats?.[0]?.splits?.[0]?.stat || null;
  } catch {
    return null;
  }
}

/**
 * Generate benchmark context for AI prompt
 */
export function generateBenchmarkContext(
  detectedMetrics: string[],
  level: "mlb" | "ncaa" | "high_school" = "ncaa"
): string {
  const averages = getLeagueAverages(level);
  
  return `
## LEAGUE BENCHMARKS (${averages.source} ${averages.year})
Use these to contextualize the player's performance:

BATTING:
- League Average BA: ${averages.batting_average.toFixed(3)}
- League Average OBP: ${averages.on_base_percentage.toFixed(3)}
- League Average SLG: ${averages.slugging_percentage.toFixed(3)}
- League Average OPS: ${averages.ops.toFixed(3)}
- League Strikeout Rate: ${averages.strikeout_rate.toFixed(1)}%
- League Walk Rate: ${averages.walk_rate.toFixed(1)}%

PITCHING:
- League ERA: ${averages.era.toFixed(2)}
- League WHIP: ${averages.whip.toFixed(2)}
- League K/9: ${averages.k_per_9.toFixed(1)}
- League BB/9: ${averages.bb_per_9.toFixed(1)}

PERCENTILE GUIDELINES:
- 90th+ percentile = Elite (top 10%)
- 70-89th percentile = Above Average
- 40-69th percentile = Average
- 20-39th percentile = Below Average
- <20th percentile = Needs significant work

When analyzing, ALWAYS compare to these benchmarks and state the percentile.
Example: "Player's .285 BA is in the 65th percentile vs ${averages.source} average of ${averages.batting_average.toFixed(3)}"
`;
}

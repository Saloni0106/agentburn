/**
 * Doctor: anti-pattern detection and recommendations engine.
 * Detects concrete issues from session data and cites actual numbers.
 */

import type { Session } from "./parser.js";
import type { SessionAnalysis } from "./analyze.js";
import { calculateCost, type ModelPricing } from "./pricing.js";
import { formatTokens, formatCost } from "./analyze.js";
import pc from "picocolors";

export interface Recommendation {
  severity: "error" | "warn" | "info";
  title: string;
  detail: string;
}

// ─── Detection rules ─────────────────────────────────────────────────────────

/**
 * Detect files that were read many times, suggesting they should be in .claudeignore
 */
function detectFatFileReads(analysis: SessionAnalysis): Recommendation[] {
  return analysis.fatFiles
    .filter((f) => f.readCount >= 3)
    .map((f) => ({
      severity: "warn" as const,
      title: "Repeatedly-read file",
      detail:
        `File \`${f.filePath}\` was read ${f.readCount} times, costing ~${formatTokens(f.tokens)} tokens. ` +
        `Consider adding it to your CLAUDE.md ignore guidance or .claudeignore.`,
    }));
}

/**
 * Detect very long sessions without compaction
 */
function detectLongSession(analysis: SessionAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];
  if (analysis.turnCount > 80) {
    recs.push({
      severity: "error",
      title: "Long session without compaction",
      detail:
        `Session exceeded ${analysis.turnCount} turns without compaction. ` +
        `Long sessions grow quadratically — each turn re-sends the full history. Run /compact to reset context.`,
    });
  } else if (analysis.turnCount > 40) {
    recs.push({
      severity: "warn",
      title: "Long session approaching limit",
      detail:
        `Session has ${analysis.turnCount} turns. Consider running /compact soon — ` +
        `token costs grow quadratically with conversation length.`,
    });
  }
  return recs;
}

/**
 * Detect high cache miss ratio (cache read tokens << input tokens)
 */
function detectCacheMisses(session: Session): Recommendation[] {
  const recs: Recommendation[] = [];
  const u = session.totalUsage;
  const totalInput =
    u.inputTokens + u.cacheCreationInputTokens + u.cacheReadInputTokens;

  if (totalInput === 0) return recs;

  const missRatio = (u.inputTokens + u.cacheCreationInputTokens) / totalInput;
  const missPercent = Math.round(missRatio * 100);

  if (missPercent > 50 && totalInput > 50_000) {
    recs.push({
      severity: "warn",
      title: "High cache miss rate",
      detail:
        `${missPercent}% of input tokens were cache misses (${formatTokens(u.inputTokens + u.cacheCreationInputTokens)} uncached). ` +
        `Avoid --resume across days; prompt caches expire after ~1 hour. ` +
        `Starting fresh sessions per-task keeps cache hits high.`,
    });
  }
  return recs;
}

/**
 * Detect extremely expensive single tool calls
 */
function detectExpensiveCalls(analysis: SessionAnalysis): Recommendation[] {
  const recs: Recommendation[] = [];
  const expensive = analysis.topToolCalls.filter((c) => c.tokens > 50_000);
  if (expensive.length > 0) {
    const top = expensive[0];
    recs.push({
      severity: "warn",
      title: "Expensive tool call",
      detail:
        `Tool \`${top.tool}\` on \`${top.target.slice(0, 60) || "(unknown)"}\` consumed ~${formatTokens(top.tokens)} tokens in a single call. ` +
        `Consider splitting large operations or reading smaller file sections.`,
    });
  }
  return recs;
}

/**
 * Detect if most tokens were output (possibly runaway generation)
 */
function detectOutputHeavy(session: Session, pricing: ModelPricing): Recommendation[] {
  const recs: Recommendation[] = [];
  const u = session.totalUsage;
  const totalToks = u.inputTokens + u.outputTokens;
  if (totalToks === 0) return recs;

  const outputRatio = u.outputTokens / totalToks;
  if (outputRatio > 0.4 && u.outputTokens > 20_000) {
    const outputCost = (u.outputTokens / 1_000_000) * pricing.outputPerMTok;
    recs.push({
      severity: "info",
      title: "Output-heavy session",
      detail:
        `${Math.round(outputRatio * 100)}% of tokens were output (${formatTokens(u.outputTokens)} tokens, ~${formatCost(outputCost)}). ` +
        `Output tokens cost 5x more than input. Consider more targeted prompts.`,
    });
  }
  return recs;
}

/**
 * Detect very high overall cost
 */
function detectHighCost(
  session: Session,
  pricing: ModelPricing
): Recommendation[] {
  const recs: Recommendation[] = [];
  const cost = calculateCost(session.totalUsage, pricing);
  if (cost.totalCost >= 2.0) {
    recs.push({
      severity: "error",
      title: "Very expensive session",
      detail:
        `This session cost ${formatCost(cost.totalCost)} — unusually high for a single session. ` +
        `Review the burn curve for runaway token growth and consider shorter, focused sessions.`,
    });
  }
  return recs;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateRecommendations(
  analysis: SessionAnalysis,
  pricing: ModelPricing
): Recommendation[] {
  return [
    ...detectFatFileReads(analysis),
    ...detectLongSession(analysis),
    ...detectCacheMisses(analysis.session),
    ...detectExpensiveCalls(analysis),
    ...detectOutputHeavy(analysis.session, pricing),
    ...detectHighCost(analysis.session, pricing),
  ];
}

const SEVERITY_ICON: Record<Recommendation["severity"], string> = {
  error: pc.red("!"),
  warn: pc.yellow("~"),
  info: pc.cyan("i"),
};

const SEVERITY_LABEL: Record<Recommendation["severity"], string> = {
  error: pc.red("ERROR"),
  warn: pc.yellow(" WARN"),
  info: pc.cyan(" INFO"),
};

export function renderDoctorReport(
  analyses: SessionAnalysis[],
  pricing: ModelPricing
): void {
  const WIDTH = 80;
  const DIVIDER = pc.dim("─".repeat(WIDTH));

  console.log();
  console.log(DIVIDER);
  console.log(pc.bold(pc.white("  agentburn doctor")));
  console.log(DIVIDER);
  console.log();

  const allRecs: Array<{
    rec: Recommendation;
    sessionId: string;
  }> = [];

  for (const analysis of analyses) {
    const recs = generateRecommendations(analysis, pricing);
    for (const rec of recs) {
      allRecs.push({ rec, sessionId: analysis.session.sessionId });
    }
  }

  if (allRecs.length === 0) {
    console.log(pc.green("  No issues detected. Looking healthy!"));
    console.log();
    console.log(DIVIDER);
    return;
  }

  for (const { rec, sessionId } of allRecs) {
    const icon = SEVERITY_ICON[rec.severity];
    const label = SEVERITY_LABEL[rec.severity];
    console.log(
      `  ${icon} ${label}  ${pc.bold(rec.title)}`
    );
    console.log(`         ${pc.dim(`[session ${sessionId.slice(0, 8)}]`)}`);
    // Word-wrap detail at ~72 chars
    const words = rec.detail.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if ((current + " " + word).length > 72) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current);
    for (const line of lines) {
      console.log("         " + line);
    }
    console.log();
  }

  console.log(DIVIDER);
}

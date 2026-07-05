/**
 * Aggregation layer: computes per-tool, per-file, and per-turn statistics
 * from parsed session data.
 */

import type { Session, TokenUsage } from "./parser.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ToolStat {
  tool: string;
  callCount: number;
  tokens: number;
}

export interface FileStat {
  filePath: string;
  readCount: number;
  tokens: number;
}

export interface TopToolCall {
  tool: string;
  target: string;
  tokens: number;
  turnIndex: number;
}

export interface SessionAnalysis {
  session: Session;
  /** Cumulative input tokens per turn (for burn curve / sparkline) */
  burnCurve: number[];
  /** Per-tool aggregated stats, sorted by tokens desc */
  toolStats: ToolStat[];
  /** Top 10 individual most expensive tool calls */
  topToolCalls: TopToolCall[];
  /** Files read more than once or with large token cost, sorted by tokens desc */
  fatFiles: FileStat[];
  /** Total turn count (assistant turns only) */
  turnCount: number;
  /** Duration in ms (null if timestamps missing) */
  durationMs: number | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isFilePath(target: string): boolean {
  return target.length > 0 && (target.startsWith("/") || target.includes("\\") || target.match(/\.[a-z]{1,5}$/i) !== null);
}

// ─── Main analysis function ──────────────────────────────────────────────

export function analyzeSession(session: Session): SessionAnalysis {
  const toolMap = new Map<string, ToolStat>();
  const fileMap = new Map<string, FileStat>();
  const allToolCalls: TopToolCall[] = [];
  const burnCurve: number[] = [];

  let cumulativeInput = 0;

  for (const turn of session.turns) {
    cumulativeInput = turn.cumulativeInputTokens;
    burnCurve.push(cumulativeInput);

    for (const tc of turn.toolCalls) {
      // Per-tool stats
      const existing = toolMap.get(tc.tool);
      if (existing) {
        existing.callCount += 1;
        existing.tokens += tc.tokens;
      } else {
        toolMap.set(tc.tool, {
          tool: tc.tool,
          callCount: 1,
          tokens: tc.tokens,
        });
      }

      // Individual call record
      allToolCalls.push({
        tool: tc.tool,
        target: tc.target,
        tokens: tc.tokens,
        turnIndex: turn.index,
      });

      // Fat-file tracking: any tool with a file-path target
      if (tc.target && isFilePath(tc.target)) {
        const existing = fileMap.get(tc.target);
        if (existing) {
          existing.readCount += 1;
          existing.tokens += tc.tokens;
        } else {
          fileMap.set(tc.target, {
            filePath: tc.target,
            readCount: 1,
            tokens: tc.tokens,
          });
        }
      }
    }
  }

  // Sort tool stats by tokens descending
  const toolStats = Array.from(toolMap.values()).sort(
    (a, b) => b.tokens - a.tokens
  );

  // Top 10 individual tool calls by tokens
  const topToolCalls = allToolCalls
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 10);

  // Fat files: read more than once OR tokens > 10k
  const fatFiles = Array.from(fileMap.values())
    .filter((f) => f.readCount > 1 || f.tokens > 10_000)
    .sort((a, b) => b.tokens - a.tokens);

  // Duration
  let durationMs: number | null = null;
  if (session.startedAt && session.endedAt) {
    durationMs =
      new Date(session.endedAt).getTime() -
      new Date(session.startedAt).getTime();
  }

  const turnCount = session.turns.filter((t) => t.role === "assistant").length;

  return {
    session,
    burnCurve,
    toolStats,
    topToolCalls,
    fatFiles,
    turnCount,
    durationMs,
  };
}

// ─── Cross-session aggregation ──────────────────────────────────────────────

export interface ProjectSummary {
  projectDir: string;
  sessionCount: number;
  totalUsage: TokenUsage;
  totalCostUsd: number;
  mostExpensiveSession: Session | null;
}

export interface AggregateStats {
  totalSessions: number;
  totalUsage: TokenUsage;
  projects: ProjectSummary[];
  /** Top 5 most expensive sessions across all projects */
  topSessions: Array<{ session: Session; costUsd: number; projectDir: string }>;
}

export function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens:
      a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  };
}

export function zeroUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

/** Format a duration in ms to a human-readable string */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "unknown";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Format a large token count with k/M suffix */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Format USD cost */
export function formatCost(usd: number): string {
  if (usd < 0.001) return "$0.00";
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

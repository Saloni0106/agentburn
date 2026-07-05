/**
 * Terminal report renderer.
 * Produces beautifully formatted output at 80-column width.
 * Uses picocolors for color and cli-table3 for aligned tables.
 */

import pc from "picocolors";
import Table from "cli-table3";
import type { SessionAnalysis, ToolStat, FileStat, TopToolCall } from "./analyze.js";
import type { Session } from "./parser.js";
import { formatTokens, formatCost, formatDuration, sumUsage } from "./analyze.js";
import { burnSparkline } from "./sparkline.js";
import { calculateCost, type ModelPricing } from "./pricing.js";

const WIDTH = 80;
const DIVIDER = pc.dim("─".repeat(WIDTH));

// ─── Cost severity coloring ─────────────────────────────────────────────────

function costColor(usd: number): string {
  if (usd >= 1.0) return pc.red(formatCost(usd));
  if (usd >= 0.1) return pc.yellow(formatCost(usd));
  return pc.green(formatCost(usd));
}

function tokenColor(tokens: number): string {
  if (tokens >= 500_000) return pc.red(formatTokens(tokens));
  if (tokens >= 100_000) return pc.yellow(formatTokens(tokens));
  return pc.cyan(formatTokens(tokens));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function padRight(s: string, len: number): string {
  const visible = stripAnsi(s);
  const pad = Math.max(0, len - visible.length);
  return s + " ".repeat(pad);
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return "..." + s.slice(s.length - (max - 3));
}

function formatDate(iso: string | null): string {
  if (!iso) return "unknown";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Header ─────────────────────────────────────────────────────────────────

function renderHeader(session: Session): void {
  console.log();
  console.log(DIVIDER);
  console.log(
    pc.bold(pc.white("  agentburn")) +
    pc.dim("  token burn report")
  );
  console.log(DIVIDER);
  console.log(
    pc.dim("  Session : ") + pc.bold(session.sessionId.slice(0, 8) + "...")
  );
  console.log(
    pc.dim("  Started : ") + pc.white(formatDate(session.startedAt))
  );
  if (session.model) {
    console.log(
      pc.dim("  Model   : ") + pc.white(session.model)
    );
  }
  console.log(DIVIDER);
}

// ─── Token Summary ──────────────────────────────────────────────────────────

function renderTokenSummary(
  analysis: SessionAnalysis,
  pricing: ModelPricing
): void {
  const u = analysis.session.totalUsage;
  const cost = calculateCost(u, pricing);

  console.log();
  console.log(pc.bold("  TOKEN SUMMARY"));
  console.log();

  const rows: [string, string, string][] = [
    ["Input tokens",         formatTokens(u.inputTokens),                   formatCost(cost.inputCost)],
    ["Output tokens",        formatTokens(u.outputTokens),                  formatCost(cost.outputCost)],
    ["Cache write tokens",   formatTokens(u.cacheCreationInputTokens),       formatCost(cost.cacheWriteCost)],
    ["Cache read tokens",    formatTokens(u.cacheReadInputTokens),           formatCost(cost.cacheReadCost)],
  ];

  for (const [label, tokens, c] of rows) {
    console.log(
      "  " +
      padRight(pc.dim(label), 30) +
      padRight(pc.bold(tokens), 16) +
      pc.dim(c)
    );
  }

  console.log();
  const totalToks =
    u.inputTokens +
    u.outputTokens +
    u.cacheCreationInputTokens +
    u.cacheReadInputTokens;
  console.log(
    "  " +
    padRight(pc.bold("TOTAL"), 30) +
    padRight(tokenColor(totalToks), 16) +
    costColor(cost.totalCost)
  );

  console.log();
  console.log(
    pc.dim("  Turns   : ") + pc.bold(String(analysis.turnCount)) +
    pc.dim("   Duration : ") + pc.bold(formatDuration(analysis.durationMs))
  );
}

// ─── Burn Curve ─────────────────────────────────────────────────────────────

function renderBurnCurve(burnCurve: number[]): void {
  if (burnCurve.length === 0) return;
  console.log();
  console.log(pc.bold("  BURN CURVE") + pc.dim("  (cumulative input tokens per turn)"));
  console.log();

  const spark = burnSparkline(burnCurve);
  // Wrap sparkline to fit in 80 cols, with 4 char indent
  const maxSparkWidth = WIDTH - 4;
  const chunks: string[] = [];
  for (let i = 0; i < spark.length; i += maxSparkWidth) {
    chunks.push(spark.slice(i, i + maxSparkWidth));
  }
  for (const chunk of chunks) {
    console.log("    " + pc.cyan(chunk));
  }
  const last = burnCurve[burnCurve.length - 1];
  console.log(
    pc.dim("    ") +
    pc.dim(`0`) +
    pc.dim(" ".repeat(Math.max(0, maxSparkWidth - String(formatTokens(last)).length - 1))) +
    pc.dim(formatTokens(last))
  );
}

// ─── Top Tool Calls ─────────────────────────────────────────────────────────

function renderTopToolCalls(topCalls: TopToolCall[]): void {
  if (topCalls.length === 0) return;
  console.log();
  console.log(pc.bold("  TOP TOKEN SINKS") + pc.dim("  (most expensive individual tool calls)"));
  console.log();

  const table = new Table({
    head: [
      pc.dim("  #"),
      pc.dim("Tool"),
      pc.dim("Target"),
      pc.dim("Tokens"),
    ],
    colWidths: [5, 14, 43, 12],
    style: { compact: true, border: [], head: [] },
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: " ", "left-mid": "", mid: "", "mid-mid": "",
      right: "", "right-mid": "", middle: " ",
    },
  });

  topCalls.slice(0, 10).forEach((tc, i) => {
    table.push([
      pc.dim(String(i + 1)),
      pc.white(tc.tool),
      pc.dim(truncate(tc.target, 42)),
      pc.bold(tokenColor(tc.tokens)),
    ]);
  });

  console.log(table.toString());
}

// ─── Per-Tool Breakdown ──────────────────────────────────────────────────────

function renderToolBreakdown(toolStats: ToolStat[]): void {
  if (toolStats.length === 0) return;
  console.log();
  console.log(pc.bold("  PER-TOOL BREAKDOWN"));
  console.log();

  const table = new Table({
    head: [pc.dim("Tool"), pc.dim("Calls"), pc.dim("Tokens")],
    colWidths: [20, 10, 14],
    style: { compact: true, border: [], head: [] },
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: " ", "left-mid": "", mid: "", "mid-mid": "",
      right: "", "right-mid": "", middle: " ",
    },
  });

  for (const stat of toolStats) {
    table.push([
      pc.white(stat.tool),
      pc.dim(String(stat.callCount)),
      tokenColor(stat.tokens),
    ]);
  }
  console.log(table.toString());
}

// ─── Fat Files ───────────────────────────────────────────────────────────────

function renderFatFiles(fatFiles: FileStat[]): void {
  if (fatFiles.length === 0) return;
  console.log();
  console.log(pc.bold("  FAT FILES") + pc.dim("  (repeatedly read or token-heavy)"));
  console.log();

  const table = new Table({
    head: [pc.dim("File"), pc.dim("Reads"), pc.dim("Tokens")],
    colWidths: [46, 8, 14],
    style: { compact: true, border: [], head: [] },
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: " ", "left-mid": "", mid: "", "mid-mid": "",
      right: "", "right-mid": "", middle: " ",
    },
  });

  for (const f of fatFiles.slice(0, 10)) {
    table.push([
      pc.yellow(truncate(f.filePath, 44)),
      pc.dim(String(f.readCount)),
      tokenColor(f.tokens),
    ]);
  }
  console.log(table.toString());
}

// ─── Sessions List ───────────────────────────────────────────────────────────

export function renderSessionsList(
  sessions: Session[],
  pricing: ModelPricing
): void {
  console.log();
  console.log(DIVIDER);
  console.log(pc.bold(pc.white("  agentburn sessions")));
  console.log(DIVIDER);
  console.log();

  if (sessions.length === 0) {
    console.log(pc.dim("  No sessions found."));
    console.log();
    return;
  }

  const table = new Table({
    head: [
      pc.dim("Session"),
      pc.dim("Date"),
      pc.dim("Turns"),
      pc.dim("Tokens"),
      pc.dim("Cost"),
    ],
    colWidths: [12, 22, 8, 12, 10],
    style: { compact: true, border: [], head: [] },
    chars: {
      top: "", "top-mid": "", "top-left": "", "top-right": "",
      bottom: "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
      left: " ", "left-mid": "", mid: "", "mid-mid": "",
      right: "", "right-mid": "", middle: " ",
    },
  });

  // Sort by cost descending
  const sorted = [...sessions].sort((a, b) => {
    const ca = calculateCost(a.totalUsage, pricing).totalCost;
    const cb = calculateCost(b.totalUsage, pricing).totalCost;
    return cb - ca;
  });

  for (const s of sorted) {
    const cost = calculateCost(s.totalUsage, pricing);
    const totalToks =
      s.totalUsage.inputTokens +
      s.totalUsage.outputTokens +
      s.totalUsage.cacheCreationInputTokens +
      s.totalUsage.cacheReadInputTokens;
    const turns = s.turns.filter((t) => t.role === "assistant").length;
    table.push([
      pc.bold(s.sessionId.slice(0, 8)),
      pc.dim(formatDate(s.startedAt)),
      pc.dim(String(turns)),
      tokenColor(totalToks),
      costColor(cost.totalCost),
    ]);
  }

  console.log(table.toString());
  console.log();
  console.log(DIVIDER);
}

// ─── All-projects aggregate ──────────────────────────────────────────────────

export interface AllProjectEntry {
  projectDir: string;
  sessions: Session[];
}

export function renderAllReport(
  projects: AllProjectEntry[],
  pricing: ModelPricing
): void {
  console.log();
  console.log(DIVIDER);
  console.log(pc.bold(pc.white("  agentburn all")));
  console.log(DIVIDER);
  console.log();

  if (projects.length === 0) {
    console.log(pc.dim("  No projects found."));
    console.log();
    return;
  }

  // Total across all projects
  let grandTotal = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
  let grandCost = 0;

  const projectCosts: Array<{ dir: string; cost: number; sessions: number }> = [];
  const allSessionEntries: Array<{ session: Session; costUsd: number; projectDir: string }> = [];

  for (const p of projects) {
    let pCost = 0;
    for (const s of p.sessions) {
      const c = calculateCost(s.totalUsage, pricing).totalCost;
      pCost += c;
      grandTotal = sumUsage(grandTotal, s.totalUsage);
      allSessionEntries.push({ session: s, costUsd: c, projectDir: p.projectDir });
    }
    grandCost += pCost;
    projectCosts.push({ dir: p.projectDir, cost: pCost, sessions: p.sessions.length });
  }

  const totalToks =
    grandTotal.inputTokens +
    grandTotal.outputTokens +
    grandTotal.cacheCreationInputTokens +
    grandTotal.cacheReadInputTokens;

  console.log(
    "  " + padRight(pc.dim("Total spend"), 30) + costColor(grandCost)
  );
  console.log(
    "  " + padRight(pc.dim("Total tokens"), 30) + tokenColor(totalToks)
  );
  console.log(
    "  " + padRight(pc.dim("Projects"), 30) + pc.bold(String(projects.length))
  );
  console.log();

  // Top 5 projects
  console.log(pc.bold("  TOP 5 PROJECTS"));
  console.log();
  projectCosts.sort((a, b) => b.cost - a.cost).slice(0, 5).forEach((p, i) => {
    console.log(
      "  " + pc.dim(String(i + 1) + ". ") +
      padRight(pc.white(truncate(p.dir.split(/[/\\]/).pop() ?? p.dir, 40)), 44) +
      costColor(p.cost)
    );
  });

  // Top 5 sessions
  console.log();
  console.log(pc.bold("  TOP 5 SESSIONS"));
  console.log();
  allSessionEntries.sort((a, b) => b.costUsd - a.costUsd).slice(0, 5).forEach((e, i) => {
    console.log(
      "  " + pc.dim(String(i + 1) + ". ") +
      padRight(pc.bold(e.session.sessionId.slice(0, 8)), 12) +
      padRight(pc.dim(truncate(e.projectDir.split(/[/\\]/).pop() ?? "", 28)), 30) +
      costColor(e.costUsd)
    );
  });

  console.log();
  console.log(DIVIDER);
}

// ─── Main session report ─────────────────────────────────────────────────────

export function renderSessionReport(
  analysis: SessionAnalysis,
  pricing: ModelPricing
): void {
  renderHeader(analysis.session);
  renderTokenSummary(analysis, pricing);
  renderBurnCurve(analysis.burnCurve);
  renderTopToolCalls(analysis.topToolCalls);
  renderToolBreakdown(analysis.toolStats);
  renderFatFiles(analysis.fatFiles);
  console.log();
  console.log(DIVIDER);
  console.log();
}

// ─── JSON output helpers ─────────────────────────────────────────────────────

export function toJsonReport(
  analysis: SessionAnalysis,
  pricing: ModelPricing
): object {
  const cost = calculateCost(analysis.session.totalUsage, pricing);
  return {
    sessionId: analysis.session.sessionId,
    startedAt: analysis.session.startedAt,
    endedAt: analysis.session.endedAt,
    model: analysis.session.model,
    turnCount: analysis.turnCount,
    durationMs: analysis.durationMs,
    usage: analysis.session.totalUsage,
    cost,
    burnCurve: analysis.burnCurve,
    topToolCalls: analysis.topToolCalls,
    toolStats: analysis.toolStats,
    fatFiles: analysis.fatFiles,
  };
}

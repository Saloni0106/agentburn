/**
 * Defensive JSONL transcript parser for Claude Code session files.
 *
 * Claude Code stores transcripts at:
 *   ~/.claude/projects/<project-slug>/<session-uuid>.jsonl
 *
 * Each line is a JSON object. This parser tolerates:
 *   - Malformed / truncated JSON lines (skipped with a warning)
 *   - Missing or unknown fields
 *   - Empty files / empty sessions
 *   - Any unknown message types
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// ─── Raw shapes (what we get from JSON.parse) ────────────────────────────────

interface RawUsage {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
}

interface RawToolUseBlock {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
}

interface RawMessage {
  id?: unknown;
  role?: unknown;
  content?: unknown;
  model?: unknown;
  usage?: unknown;
}

interface RawTranscriptLine {
  type?: unknown;
  message?: unknown;
  timestamp?: unknown;
  sessionId?: unknown;
  uuid?: unknown;
  costUSD?: unknown;
  cwd?: unknown;
}

// ─── Normalized shapes (what callers consume) ─────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface ToolCall {
  tool: string;
  /** Best-effort path/command extracted from the tool input */
  target: string;
  /** Approximate tokens attributed to this specific tool call (heuristic) */
  tokens: number;
}

export interface Turn {
  index: number;
  timestamp: string | null;
  role: "user" | "assistant" | "system" | "unknown";
  usage: TokenUsage;
  toolCalls: ToolCall[];
  /** Cumulative input tokens up to and including this turn */
  cumulativeInputTokens: number;
  model: string | null;
}

export interface Session {
  sessionId: string;
  filePath: string;
  /** ISO timestamp of first message */
  startedAt: string | null;
  /** ISO timestamp of last message */
  endedAt: string | null;
  turns: Turn[];
  totalUsage: TokenUsage;
  model: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.round(v));
  if (typeof v === "string") {
    const n = Number(v);
    if (isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseUsage(raw: unknown): TokenUsage {
  if (!raw || typeof raw !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
  }
  const u = raw as RawUsage;
  return {
    inputTokens: safeNum(u.input_tokens),
    outputTokens: safeNum(u.output_tokens),
    cacheCreationInputTokens: safeNum(u.cache_creation_input_tokens),
    cacheReadInputTokens: safeNum(u.cache_read_input_tokens),
  };
}

/**
 * Extract a human-readable target from a tool input object.
 * Different tools store paths/commands in different fields.
 */
function extractTarget(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;

  // Common field names for file paths
  for (const field of ["file_path", "path", "filePath", "file"]) {
    if (typeof inp[field] === "string" && inp[field]) {
      return inp[field] as string;
    }
  }
  // Bash / shell commands
  if (toolName === "Bash" || toolName === "bash") {
    const cmd = inp["command"] ?? inp["cmd"] ?? inp["bash"];
    if (typeof cmd === "string" && cmd) {
      // Truncate long commands
      return cmd.split("\n")[0].trim().slice(0, 120);
    }
  }
  // Grep pattern
  if (toolName === "Grep" || toolName === "grep") {
    const pattern = inp["pattern"] ?? inp["query"] ?? inp["regex"];
    const gPath = inp["path"] ?? inp["directory"];
    if (typeof pattern === "string") {
      return gPath ? `${pattern} in ${gPath}` : pattern;
    }
  }
  // Generic fallback — first string value found
  for (const val of Object.values(inp)) {
    if (typeof val === "string" && val.length > 0 && val.length < 200) {
      return val;
    }
  }
  return "";
}

function parseToolCalls(content: unknown, totalTokens: number): ToolCall[] {
  const calls: ToolCall[] = [];
  if (!Array.isArray(content)) return calls;

  const toolBlocks = content.filter((block) => {
    if (!block || typeof block !== "object") return false;
    const b = block as RawToolUseBlock;
    return b.type === "tool_use";
  });

  const perCallTokens =
    toolBlocks.length > 0 ? Math.round(totalTokens / toolBlocks.length) : 0;

  for (const block of toolBlocks) {
    const b = block as RawToolUseBlock;
    const toolName = safeStr(b.name) || "Unknown";
    const target = extractTarget(toolName, b.input);
    calls.push({
      tool: toolName,
      target,
      tokens: perCallTokens,
    });
  }
  return calls;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a single JSONL session file into a Session object.
 * Malformed lines are silently skipped.
 */
export function parseSessionFile(filePath: string): Session {
  const sessionId = basename(filePath, ".jsonl");
  const session: Session = {
    sessionId,
    filePath,
    startedAt: null,
    endedAt: null,
    turns: [],
    totalUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
    model: null,
  };

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return session;
  }

  const lines = raw.split("\n");
  let turnIndex = 0;
  let cumulativeInput = 0;
  // Claude Code may write multiple JSONL lines for the same API message
  // (one per content block), each repeating the same `message.id` and usage.
  // Count usage only once per message id to avoid double-counting tokens.
  const turnByMessageId = new Map<string, Turn>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: RawTranscriptLine;
    try {
      obj = JSON.parse(trimmed) as RawTranscriptLine;
    } catch {
      // Malformed line — skip
      continue;
    }

    // Extract timestamp
    const ts =
      typeof obj.timestamp === "string"
        ? obj.timestamp
        : typeof obj.timestamp === "number"
          ? new Date(obj.timestamp).toISOString()
          : null;

    if (ts && !session.startedAt) session.startedAt = ts;
    if (ts) session.endedAt = ts;

    // Determine message object — some formats nest inside `message`, others are flat
    const msgObj: RawMessage =
      obj.message && typeof obj.message === "object"
        ? (obj.message as RawMessage)
        : (obj as unknown as RawMessage);

    const role = safeStr(msgObj.role || obj.type);
    const normalizedRole: Turn["role"] =
      role === "user"
        ? "user"
        : role === "assistant"
          ? "assistant"
          : role === "system"
            ? "system"
            : "unknown";

    const usage = parseUsage(msgObj.usage);
    const model =
      typeof msgObj.model === "string" ? msgObj.model : null;

    if (model && !session.model) session.model = model;

    const totalTurnTokens =
      usage.inputTokens +
      usage.outputTokens +
      usage.cacheCreationInputTokens +
      usage.cacheReadInputTokens;

    // Duplicate line for a message we've already counted:
    // merge its tool calls into the existing turn and skip usage accumulation.
    const messageId = typeof msgObj.id === "string" ? msgObj.id : "";
    if (messageId && turnByMessageId.has(messageId)) {
      const existingTurn = turnByMessageId.get(messageId)!;
      const extraToolCalls = parseToolCalls(msgObj.content, 0);
      existingTurn.toolCalls.push(...extraToolCalls);
      if (ts) existingTurn.timestamp = existingTurn.timestamp ?? ts;
      continue;
    }

    const toolCalls = parseToolCalls(msgObj.content, totalTurnTokens);

    cumulativeInput += usage.inputTokens;

    const turn: Turn = {
      index: turnIndex++,
      timestamp: ts,
      role: normalizedRole,
      usage,
      toolCalls,
      cumulativeInputTokens: cumulativeInput,
      model,
    };

    session.turns.push(turn);
    if (messageId) turnByMessageId.set(messageId, turn);

    // Accumulate totals
    session.totalUsage.inputTokens += usage.inputTokens;
    session.totalUsage.outputTokens += usage.outputTokens;
    session.totalUsage.cacheCreationInputTokens +=
      usage.cacheCreationInputTokens;
    session.totalUsage.cacheReadInputTokens += usage.cacheReadInputTokens;
  }

  return session;
}

/**
 * Find all JSONL session files under a given directory (non-recursive).
 */
export function findSessionFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(dir, f))
      .filter((f) => {
        try {
          return statSync(f).isFile();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * Convert a working directory path to the slug Claude Code uses for
 * ~/.claude/projects/ directory names (non-alphanumeric chars become "-").
 * Example: /home/user/my.app → -home-user-my-app
 */
export function cwdToSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * Find the project transcript directory for the current working directory.
 * Claude Code maps cwd → a slug under ~/.claude/projects/
 */
export function findProjectDir(
  cwd: string = process.cwd(),
  base: string = join(homedir(), ".claude", "projects")
): string | null {
  try {
    const entries = readdirSync(base);
    const cwdSlug = cwdToSlug(cwd);

    // 1. Exact slug match
    const exact = entries.find((e) => e === cwdSlug);
    if (exact) return join(base, exact);

    // 2. Suffix match on the slugified last path segment
    //    (handles differing mount points / home prefixes)
    const lastSegment = cwd.split(/[/\\]/).filter(Boolean).pop() ?? "";
    const segSlug = cwdToSlug(lastSegment);
    if (segSlug.length > 2) {
      const suffixMatches = entries
        .filter((e) => e.endsWith(`-${segSlug}`) || e === segSlug)
        .sort((a, b) => b.length - a.length);
      if (suffixMatches.length > 0) return join(base, suffixMatches[0]);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse all sessions in a directory, sorted by start time ascending.
 */
export function parseAllSessions(dir: string): Session[] {
  const files = findSessionFiles(dir);
  return files
    .map((f) => parseSessionFile(f))
    .filter((s) => s.turns.length > 0)
    .sort((a, b) => {
      const ta = a.startedAt ?? "";
      const tb = b.startedAt ?? "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
}

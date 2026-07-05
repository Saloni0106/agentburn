#!/usr/bin/env node
/**
 * agentburn CLI — hand-rolled argument parser, no commander dependency.
 *
 * Commands:
 *   agentburn                 Analyze most recent session of current project
 *   agentburn sessions        List all sessions for current project
 *   agentburn all             Aggregate report across all projects
 *   agentburn doctor          Recommendations engine
 *
 * Flags:
 *   --dir <path>              Override transcript directory
 *   --json                    Machine-readable JSON output
 *   --price-in <rate>         Override input token price (per MTok, USD)
 *   --price-out <rate>        Override output token price (per MTok, USD)
 *   --help, -h                Show help
 *   --version, -v             Show version
 */

import { join } from "node:path";
import { readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { parseSessionFile, parseAllSessions, findSessionFiles } from "./parser.js";
import { analyzeSession } from "./analyze.js";
import {
  renderSessionReport,
  renderSessionsList,
  renderAllReport,
  toJsonReport,
  type AllProjectEntry,
} from "./report.js";
import { renderDoctorReport } from "./doctor.js";
import { getPricing } from "./pricing.js";

// ─── Package version ─────────────────────────────────────────────────────────

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const req = createRequire(import.meta.url);
    const pkg = req(join(__dirname, "..", "package.json")) as { version: string };
    return pkg.version;
  } catch {
    return "0.1.0";
  }
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

interface ParsedArgs {
  command: "default" | "sessions" | "all" | "doctor";
  dir: string | null;
  json: boolean;
  priceIn: number | null;
  priceOut: number | null;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // strip node + script
  const result: ParsedArgs = {
    command: "default",
    dir: null,
    json: false,
    priceIn: null,
    priceOut: null,
    help: false,
    version: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    switch (arg) {
      case "sessions":
        result.command = "sessions";
        break;
      case "all":
        result.command = "all";
        break;
      case "doctor":
        result.command = "doctor";
        break;
      case "--json":
        result.json = true;
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--version":
      case "-v":
        result.version = true;
        break;
      case "--dir": {
        i++;
        if (i < args.length) result.dir = args[i];
        break;
      }
      case "--price-in": {
        i++;
        if (i < args.length) {
          const v = parseFloat(args[i]);
          if (!isNaN(v)) result.priceIn = v;
        }
        break;
      }
      case "--price-out": {
        i++;
        if (i < args.length) {
          const v = parseFloat(args[i]);
          if (!isNaN(v)) result.priceOut = v;
        }
        break;
      }
      default:
        // Unknown arg — ignore
        break;
    }
    i++;
  }

  return result;
}

// ─── Directory resolution ─────────────────────────────────────────────────────

function findClaudeProjectsBase(): string {
  return join(homedir(), ".claude", "projects");
}

function findCurrentProjectDir(overrideDir: string | null): string | null {
  if (overrideDir) return overrideDir;

  const base = findClaudeProjectsBase();
  if (!existsSync(base)) return null;

  const cwd = process.cwd();

  try {
    const entries = readdirSync(base);
    // Try to find a directory name that reflects the current working dir
    const lastPart = cwd.split(/[/\\]/).filter(Boolean).pop() ?? "";

    // Sort by specificity: prefer longer matching names
    const matches = entries
      .filter((e) => {
        const eLower = e.toLowerCase().replace(/-/g, "/");
        return eLower.includes(lastPart.toLowerCase()) && lastPart.length > 2;
      })
      .sort((a, b) => b.length - a.length);

    if (matches.length > 0) return join(base, matches[0]);

    // Fallback: pick the directory most recently modified
    const withStats = entries
      .map((e) => {
        const full = join(base, e);
        try {
          const st = statSync(full);
          return { name: e, mtime: st.mtime.getTime(), isDir: st.isDirectory() };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.isDir)
      .sort((a, b) => b.mtime - a.mtime);

    return withStats.length > 0 ? join(base, withStats[0].name) : null;
  } catch {
    return null;
  }
}

function getMostRecentSession(dir: string) {
  const files = findSessionFiles(dir);
  if (files.length === 0) return null;
  // Sort by mtime descending
  const withStats = files
    .map((f) => {
      try {
        return { f, mtime: statSync(f).mtime.getTime() };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.mtime - a.mtime);
  return withStats.length > 0 ? withStats[0].f : null;
}

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
  agentburn v${getVersion()}
  See exactly where your Claude Code tokens (and money) went.

  Usage:
    agentburn [command] [options]

  Commands:
    (default)    Analyze the most recent session of the current project
    sessions     List all sessions for the current project, sorted by cost
    all          Aggregate report across all projects
    doctor       Actionable recommendations based on your data

  Options:
    --dir <path>       Override the transcript directory
    --json             Output machine-readable JSON
    --price-in <n>     Override input price (USD per million tokens)
    --price-out <n>    Override output price (USD per million tokens)
    --help, -h         Show this help
    --version, -v      Show version

  Examples:
    npx agentburn
    npx agentburn sessions
    npx agentburn all --json
    npx agentburn doctor
    npx agentburn --dir ~/my-transcripts
`);
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function cmdDefault(args: ParsedArgs): Promise<void> {
  const dir = findCurrentProjectDir(args.dir);
  if (!dir) {
    console.error(
      "agentburn: No Claude Code project directory found for the current directory.\n" +
      "  Run inside a project that has Claude Code sessions, or use --dir <path>."
    );
    process.exit(1);
  }

  const sessionFile = getMostRecentSession(dir);
  if (!sessionFile) {
    console.error(`agentburn: No session files found in ${dir}`);
    process.exit(1);
  }

  const session = parseSessionFile(sessionFile);
  if (session.turns.length === 0) {
    console.error("agentburn: Session is empty or could not be parsed.");
    process.exit(1);
  }

  const pricing = getPricing(session.model ?? undefined, {
    priceIn: args.priceIn ?? undefined,
    priceOut: args.priceOut ?? undefined,
  });
  const analysis = analyzeSession(session);

  if (args.json) {
    console.log(JSON.stringify(toJsonReport(analysis, pricing), null, 2));
  } else {
    renderSessionReport(analysis, pricing);
  }
}

async function cmdSessions(args: ParsedArgs): Promise<void> {
  const dir = findCurrentProjectDir(args.dir);
  if (!dir) {
    console.error("agentburn: No Claude Code project directory found.");
    process.exit(1);
  }

  const sessions = parseAllSessions(dir);
  const pricing = getPricing(undefined, {
    priceIn: args.priceIn ?? undefined,
    priceOut: args.priceOut ?? undefined,
  });

  if (args.json) {
    const out = sessions.map((s) => {
      const analysis = analyzeSession(s);
      return toJsonReport(analysis, pricing);
    });
    console.log(JSON.stringify(out, null, 2));
  } else {
    renderSessionsList(sessions, pricing);
  }
}

async function cmdAll(args: ParsedArgs): Promise<void> {
  const base = findClaudeProjectsBase();
  if (!existsSync(base)) {
    console.error(`agentburn: No Claude Code data found at ${base}`);
    process.exit(1);
  }

  const pricing = getPricing(undefined, {
    priceIn: args.priceIn ?? undefined,
    priceOut: args.priceOut ?? undefined,
  });

  let projectDirs: string[] = [];
  try {
    projectDirs = readdirSync(base)
      .map((e) => join(base, e))
      .filter((p) => {
        try { return statSync(p).isDirectory(); } catch { return false; }
      });
  } catch {
    console.error("agentburn: Could not read projects directory.");
    process.exit(1);
  }

  const projects: AllProjectEntry[] = [];
  for (const dir of projectDirs) {
    const sessions = parseAllSessions(dir);
    if (sessions.length > 0) {
      projects.push({ projectDir: dir, sessions });
    }
  }

  if (args.json) {
    const out = {
      projects: projects.map((p) => ({
        projectDir: p.projectDir,
        sessions: p.sessions.map((s) => {
          const analysis = analyzeSession(s);
          return toJsonReport(analysis, pricing);
        }),
      })),
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    renderAllReport(projects, pricing);
  }
}

async function cmdDoctor(args: ParsedArgs): Promise<void> {
  const dir = findCurrentProjectDir(args.dir);
  if (!dir) {
    console.error("agentburn: No Claude Code project directory found.");
    process.exit(1);
  }

  const sessions = parseAllSessions(dir);
  const pricing = getPricing(undefined, {
    priceIn: args.priceIn ?? undefined,
    priceOut: args.priceOut ?? undefined,
  });

  const analyses = sessions.map((s) => analyzeSession(s));

  if (args.json) {
    const { generateRecommendations } = await import("./doctor.js");
    const out = analyses.map((a) => ({
      sessionId: a.session.sessionId,
      recommendations: generateRecommendations(a, pricing),
    }));
    console.log(JSON.stringify(out, null, 2));
  } else {
    renderDoctorReport(analyses, pricing);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.version) {
    console.log(`agentburn v${getVersion()}`);
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  switch (args.command) {
    case "sessions":
      await cmdSessions(args);
      break;
    case "all":
      await cmdAll(args);
      break;
    case "doctor":
      await cmdDoctor(args);
      break;
    default:
      await cmdDefault(args);
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error("agentburn: fatal error:", err.message);
  } else {
    console.error("agentburn: fatal error:", err);
  }
  process.exit(1);
});

<div align="center">

# agentburn 🔥

**See exactly where your Claude Code tokens (and money) went.**

[![npm version](https://img.shields.io/npm/v/agentburn.svg)](https://www.npmjs.com/package/agentburn)
[![CI](https://github.com/anthropics/agentburn/actions/workflows/ci.yml/badge.svg)](https://github.com/anthropics/agentburn/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

</div>

```
$ npx agentburn-cli sessions

────────────────────────────────────────────────────────────────────────────────
  agentburn sessions
────────────────────────────────────────────────────────────────────────────────

  Session      Date                   Turns    Tokens       Cost
  cafebabe     Jun 20, 2026, 10:00…   8        375.9k       $0.98
  deadbeef     Jun 15, 2026, 02:00…   6        135.7k       $0.32
  abc123de     Jun 10, 2026, 09:00…   7        58.9k        $0.15
  edgecase     Jun 25, 2026, 08:00…   4        2.6k         $0.01

────────────────────────────────────────────────────────────────────────────────

$ npx agentburn-cli

────────────────────────────────────────────────────────────────────────────────
  agentburn  token burn report
────────────────────────────────────────────────────────────────────────────────
  Session : cafebabe...
  Started : Jun 20, 2026, 10:00 AM
  Model   : claude-opus-4-5
────────────────────────────────────────────────────────────────────────────────

  TOKEN SUMMARY

  Input tokens                  291.0k          $4.3650
  Output tokens                 84.5k           $6.3375
  Cache write tokens            5.0k            $0.0938
  Cache read tokens             65.0k           $0.0975

  TOTAL                         375.9k          $10.8938

  Turns   : 8   Duration : 5m 45s

  BURN CURVE  (cumulative input tokens per turn)

     ▁▂▃▄▅▆▇█
    0                                                                     291.0k

  TOP TOKEN SINKS  (most expensive individual tool calls)

    #   Tool           Target                                      Tokens
  1     Bash           cd /todo-api && npm install express @typ…  87.4k
  2     Write          /home/user/todo-api/src/routes/todos.ts    43.7k
  3     Write          /home/user/todo-api/src/models/todo.ts     43.7k

  FAT FILES  (repeatedly read or token-heavy)

  File                                             Reads    Tokens
  /home/user/api-service/src/database/pool.ts      3        32.0k

────────────────────────────────────────────────────────────────────────────────

$ npx agentburn-cli doctor

  ~  WARN  Repeatedly-read file
         File pool.ts was read 3 times (~32.0k tokens). Add to .claudeignore.

  ~  WARN  High cache miss rate
         77% of tokens were cache misses. Avoid --resume across days.

  ~  WARN  Expensive tool call
         Bash consumed ~87.4k tokens in one call. Split large operations.
```

> **100% local. Zero config. Your transcripts never leave your machine.**

## Why

I built this because I blew through my weekly Claude Code quota in 2 days and had no idea why. Claude Code re-sends the entire conversation history and all tool schemas on every single turn, so your token costs grow **quadratically** — a 100-turn session doesn't cost 2× a 50-turn session, it costs ~4×. Developers routinely hit Max-plan limits without any visibility into what's eating their budget. `agentburn` answers *"what is eating my tokens?"* in one command.

> **100% local. Your transcripts never leave your machine.** `agentburn` reads the JSONL files Claude Code stores locally and does all analysis on your device. No telemetry, no network calls.

---

## Install

No install needed:

```bash
npx agentburn-cli
```

Or install globally:

```bash
npm i -g agentburn-cli
```

---

## Commands

### `agentburn` — most recent session report

Analyzes the most recent session for your current project directory.

```
────────────────────────────────────────────────────────────────────────────────
  agentburn  token burn report
────────────────────────────────────────────────────────────────────────────────
  Session : cafebabe...
  Started : Jun 20, 2026, 10:00 AM
  Model   : claude-opus-4-5
────────────────────────────────────────────────────────────────────────────────

  TOKEN SUMMARY

  Input tokens                  291.0k          $4.3650
  Output tokens                 84.5k           $6.3375
  Cache write tokens            5.0k            $0.0938
  Cache read tokens             65.0k           $0.0975

  TOTAL                         375.9k          $10.8938

  Turns   : 8   Duration : 5m 45s

  BURN CURVE  (cumulative input tokens per turn)

     ▁▂▃▄▅▆▇█
    0                                                                     291.0k

  TOP TOKEN SINKS  (most expensive individual tool calls)

    #   Tool           Target                                      Tokens
  1     Bash           cd /home/user/todo-api && npm install exp…  87.4k
  2     Write          /home/user/todo-api/src/routes/todos.ts     43.7k
  3     Write          /home/user/todo-api/src/models/todo.ts      43.7k
  ...

  PER-TOOL BREAKDOWN

  Tool                 Calls      Tokens
  Bash                 3          262.2k
  Write                4          87.4k

  FAT FILES  (repeatedly read or token-heavy)

  File                                             Reads    Tokens
  /home/user/api-service/src/database/pool.ts      3        32.0k
────────────────────────────────────────────────────────────────────────────────
```

### `agentburn sessions` — list all sessions

```
────────────────────────────────────────────────────────────────────────────────
  agentburn sessions
────────────────────────────────────────────────────────────────────────────────

  Session      Date                   Turns    Tokens       Cost
  cafebabe     Jun 20, 2026, 10:00…   8        375.9k       $10.89
  deadbeef     Jun 15, 2026, 02:00…   6        135.7k       $0.32
  abc123de     Jun 10, 2026, 09:00…   7        58.9k        $0.15

────────────────────────────────────────────────────────────────────────────────
```

### `agentburn all` — aggregate across all projects

```
────────────────────────────────────────────────────────────────────────────────
  agentburn all
────────────────────────────────────────────────────────────────────────────────

  Total spend                   $12.43
  Total tokens                  572.0k
  Projects                      2

  TOP 5 PROJECTS

  1. todo-api                                                         $10.89
  2. myproject                                                        $1.54

  TOP 5 SESSIONS

  1. cafebabe     todo-api                                            $10.89
  2. deadbeef     api-service                                         $0.32
  3. abc123de     myproject                                           $0.15

────────────────────────────────────────────────────────────────────────────────
```

### `agentburn doctor` — actionable recommendations

```
────────────────────────────────────────────────────────────────────────────────
  agentburn doctor
────────────────────────────────────────────────────────────────────────────────

  ~  WARN  Repeatedly-read file
         [session abc123de]
         File `src/main.ts` was read 3 times, costing ~21.7k tokens. Consider
         adding it to your CLAUDE.md ignore guidance or .claudeignore.

  ~  WARN  High cache miss rate
         [session cafebabe]
         77% of input tokens were cache misses (286.0k uncached). Avoid
         --resume across days; prompt caches expire after ~1 hour.

  ~  WARN  Expensive tool call
         [session cafebabe]
         Tool `Bash` on `cd /todo-api && npm install express` consumed ~87.4k
         tokens in a single call. Consider splitting large operations.

────────────────────────────────────────────────────────────────────────────────
```

### `--json` flag — machine-readable output

Every command supports `--json` for scripting:

```bash
npx agentburn-cli --json | jq '.usage.inputTokens'
npx agentburn-cli sessions --json | jq '.[0].cost.totalCost'
npx agentburn-cli all --json > spend-report.json
npx agentburn-cli doctor --json | jq '.[].recommendations[].severity'
```

### Other options

```bash
npx agentburn-cli --dir ~/path/to/transcripts   # Override transcript directory
npx agentburn-cli --price-in 3.0                # Override input price (USD/MTok)
npx agentburn-cli --price-out 15.0              # Override output price (USD/MTok)
npx agentburn-cli --version                     # Show version
npx agentburn-cli --help                        # Show help
```

---

## How it works

1. Claude Code writes session transcripts as JSONL files to `~/.claude/projects/<project-slug>/<session-uuid>.jsonl`
2. `agentburn` reads those files — no network calls, no API keys
3. Each line is parsed defensively (malformed lines are skipped, missing fields default to zero)
4. Tokens are aggregated per tool, per file, and per turn to produce the burn report

**100% local. Your transcripts never leave your machine.**

---

## Pricing

The pricing table (`src/pricing.ts`) is updated manually and marked with a `Last updated` date. You can always override it:

```bash
agentburn --price-in 3.0 --price-out 15.0
```

---

## FAQ

**Which agents are supported?**

Claude Code today. The parser is intentionally pluggable — PRs to add support for [Codex CLI](https://github.com/openai/codex), [Gemini CLI](https://github.com/google-gemini/gemini-cli), and [opencode](https://github.com/sst/opencode) are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

**Does this send my data anywhere?**

No. `agentburn` is purely local. It reads files from `~/.claude/` and writes nothing. Zero network requests.

**The cost estimates are wrong for my plan.**

Use `--price-in` and `--price-out` to set exact rates per million tokens. Token counts will always be accurate — only the dollar conversion depends on pricing.

**It says "no sessions found".**

Make sure you're running inside a project directory that has Claude Code history, or use `--dir ~/.claude/projects/your-project-slug` to point directly at the sessions.

---

## Roadmap

- [ ] Per-file cost heatmap (which files cost the most across all sessions)
- [ ] `--since <date>` flag to filter sessions by date range
- [ ] Session comparison (`agentburn diff <session-a> <session-b>`)
- [ ] Web dashboard export (`agentburn --html > report.html`)
- [ ] Support for Codex CLI and Gemini CLI transcript formats

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs are welcome, especially for supporting other agent CLIs.

## License

[MIT](LICENSE)

# Contributing to agentburn

Thank you for your interest in contributing! This is a welcoming project and all contributions are appreciated.

## Quick start

```bash
git clone https://github.com/anthropics/agentburn
cd agentburn
npm install
npm test         # run tests
npm run build    # compile TypeScript
npm run lint     # type-check
```

## Project structure

```
src/
  cli.ts        # arg parsing — hand-rolled, no dependencies
  parser.ts     # defensive JSONL transcript parser
  analyze.ts    # aggregation: per-tool, per-file, per-turn
  report.ts     # terminal rendering (picocolors + cli-table3)
  doctor.ts     # anti-pattern detection & recommendations
  pricing.ts    # Anthropic model pricing table
  sparkline.ts  # ASCII sparkline generator
test/
  fixtures/     # realistic JSONL session fixtures
  *.test.ts     # node:test based test suites
```

## Guidelines

- **Zero new runtime dependencies** — only `picocolors` and `cli-table3` are allowed. Everything else must be hand-rolled.
- **Strict TypeScript** — no `any`, no `@ts-ignore`. Run `npm run lint` before opening a PR.
- **Test coverage** — all new features must have tests in `test/*.test.ts` using `node:test`.
- **Defensive parsing** — the parser must never throw on malformed input. All new fields must be detected at runtime.

## Most wanted contributions

### Support for other agent CLIs

The parser is intentionally pluggable. The community would love support for:

- **[Codex CLI](https://github.com/openai/codex)** — OpenAI's coding agent
- **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** — Google's coding agent
- **[opencode](https://github.com/sst/opencode)** — SST's open-source agent

To add support: create a new fixture in `test/fixtures/`, update `parser.ts` to detect the new format, and add tests.

### Pricing table updates

The pricing table in `src/pricing.ts` has a `Last updated` date — PRs to keep it current are very welcome.

### New doctor rules

`src/doctor.ts` is designed to accumulate detection rules. If you've found a token anti-pattern, add a rule!

## Submitting a PR

1. Fork and create a branch: `git checkout -b feat/my-feature`
2. Make your changes with tests
3. Run `npm test && npm run lint && npm run build`
4. Open a PR with a clear description of what it does and why

## Code of conduct

Be kind. Disagreements about code are fine; personal attacks are not.

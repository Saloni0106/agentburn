/**
 * Tests for analyze.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { parseSessionFile } from "../src/parser.js";
import {
  analyzeSession,
  formatTokens,
  formatCost,
  formatDuration,
  sumUsage,
  zeroUsage,
} from "../src/analyze.js";

const FIXTURES = join(process.cwd(), "test", "fixtures");

describe("analyzeSession", () => {
  it("produces a burn curve with one entry per turn", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    assert.equal(analysis.burnCurve.length, session.turns.length);
  });

  it("burn curve is non-decreasing", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    for (let i = 1; i < analysis.burnCurve.length; i++) {
      assert.ok(
        analysis.burnCurve[i] >= analysis.burnCurve[i - 1],
        "burn curve must be non-decreasing"
      );
    }
  });

  it("aggregates tool stats correctly", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    assert.ok(analysis.toolStats.length > 0, "should have tool stats");
    // Tool stats should be sorted by tokens descending
    for (let i = 1; i < analysis.toolStats.length; i++) {
      assert.ok(
        analysis.toolStats[i].tokens <= analysis.toolStats[i - 1].tokens,
        "tool stats should be sorted by tokens desc"
      );
    }
  });

  it("identifies top tool calls (max 10)", () => {
    const session = parseSessionFile(join(FIXTURES, "session-api-build.jsonl"));
    const analysis = analyzeSession(session);
    assert.ok(analysis.topToolCalls.length <= 10, "topToolCalls should be <= 10");
    assert.ok(analysis.topToolCalls.length > 0, "should have top tool calls");
  });

  it("top tool calls are sorted by tokens descending", () => {
    const session = parseSessionFile(join(FIXTURES, "session-debug.jsonl"));
    const analysis = analyzeSession(session);
    for (let i = 1; i < analysis.topToolCalls.length; i++) {
      assert.ok(
        analysis.topToolCalls[i].tokens <= analysis.topToolCalls[i - 1].tokens
      );
    }
  });

  it("detects fat files (files read multiple times)", () => {
    // session-refactor reads main.ts twice
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    // Should find the repeatedly-read file
    const mainTs = analysis.fatFiles.find((f) =>
      f.filePath.includes("main.ts")
    );
    assert.ok(mainTs !== undefined, "should detect main.ts as a fat file");
    assert.ok(mainTs.readCount >= 2, "main.ts should have readCount >= 2");
  });

  it("counts assistant turns correctly", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    assert.ok(analysis.turnCount > 0);
    // Turn count = number of assistant messages
    const expectedAssistantTurns = session.turns.filter(
      (t) => t.role === "assistant"
    ).length;
    assert.equal(analysis.turnCount, expectedAssistantTurns);
  });

  it("calculates duration from timestamps", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    assert.ok(analysis.durationMs !== null, "should have duration");
    assert.ok((analysis.durationMs ?? 0) > 0, "duration should be positive");
  });

  it("handles edge-case sessions without crashing", () => {
    const session = parseSessionFile(join(FIXTURES, "session-edge-cases.jsonl"));
    let analysis: ReturnType<typeof analyzeSession> | undefined;
    assert.doesNotThrow(() => {
      analysis = analyzeSession(session);
    });
    assert.ok(analysis !== undefined);
  });
});

describe("utility functions", () => {
  it("formatTokens formats large numbers", () => {
    assert.equal(formatTokens(1_500_000), "1.5M");
    assert.equal(formatTokens(150_000), "150.0k");
    assert.equal(formatTokens(999), "999");
  });

  it("formatCost formats USD amounts", () => {
    assert.ok(formatCost(0).startsWith("$"));
    assert.ok(formatCost(1.23).includes("1.23"));
    assert.ok(formatCost(0.0001).startsWith("$"));
  });

  it("formatDuration handles various durations", () => {
    assert.equal(formatDuration(null), "unknown");
    assert.equal(formatDuration(-100), "unknown");
    assert.equal(formatDuration(90_000), "1m 30s");
    assert.equal(formatDuration(3_661_000), "1h 1m");
  });

  it("sumUsage correctly adds token counts", () => {
    const a = { inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 25, cacheReadInputTokens: 10 };
    const b = { inputTokens: 200, outputTokens: 100, cacheCreationInputTokens: 0, cacheReadInputTokens: 30 };
    const sum = sumUsage(a, b);
    assert.equal(sum.inputTokens, 300);
    assert.equal(sum.outputTokens, 150);
    assert.equal(sum.cacheCreationInputTokens, 25);
    assert.equal(sum.cacheReadInputTokens, 40);
  });

  it("zeroUsage returns all zeros", () => {
    const z = zeroUsage();
    assert.equal(z.inputTokens, 0);
    assert.equal(z.outputTokens, 0);
    assert.equal(z.cacheCreationInputTokens, 0);
    assert.equal(z.cacheReadInputTokens, 0);
  });
});

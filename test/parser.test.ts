/**
 * Tests for parser.ts
 * Uses node:test — run with: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { parseSessionFile, findSessionFiles } from "../src/parser.js";

const FIXTURES = join(process.cwd(), "test", "fixtures");

describe("parseSessionFile", () => {
  it("parses a normal session file correctly", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    assert.ok(session.turns.length > 0, "should have turns");
    assert.equal(session.sessionId, "session-refactor");
    assert.ok(session.startedAt !== null, "should have startedAt");
    assert.ok(session.endedAt !== null, "should have endedAt");
    assert.ok(session.model !== null, "should detect model");
    assert.match(session.model ?? "", /claude/);
  });

  it("accumulates total usage correctly", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const u = session.totalUsage;
    assert.ok(u.inputTokens > 0, "should have input tokens");
    assert.ok(u.outputTokens > 0, "should have output tokens");
  });

  it("extracts tool calls from assistant messages", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const allTools = session.turns.flatMap((t) => t.toolCalls);
    assert.ok(allTools.length > 0, "should have tool calls");
    // Should find Read, Edit, Bash tools
    const toolNames = new Set(allTools.map((t) => t.tool));
    assert.ok(toolNames.has("Read"), "should detect Read tool");
    assert.ok(toolNames.has("Edit"), "should detect Edit tool");
  });

  it("extracts file targets from Read tool calls", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const readCalls = session.turns
      .flatMap((t) => t.toolCalls)
      .filter((tc) => tc.tool === "Read");
    assert.ok(readCalls.length > 0);
    assert.ok(readCalls[0].target.length > 0, "Read call should have target path");
  });

  it("computes cumulative input tokens per turn (burn curve data)", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    let prev = 0;
    for (const turn of session.turns) {
      assert.ok(
        turn.cumulativeInputTokens >= prev,
        "cumulative tokens should be non-decreasing"
      );
      prev = turn.cumulativeInputTokens;
    }
  });

  it("handles malformed lines gracefully (edge case fixture)", () => {
    // Should not throw
    let session: ReturnType<typeof parseSessionFile> | undefined;
    assert.doesNotThrow(() => {
      session = parseSessionFile(join(FIXTURES, "session-edge-cases.jsonl"));
    });
    assert.ok(session !== undefined);
    // Some turns should have been parsed despite the bad lines
    assert.ok(session!.turns.length > 0);
  });

  it("handles missing usage fields gracefully", () => {
    const session = parseSessionFile(join(FIXTURES, "session-edge-cases.jsonl"));
    // No turn should have negative token counts
    for (const turn of session.turns) {
      assert.ok(turn.usage.inputTokens >= 0, "input tokens should be >= 0");
      assert.ok(turn.usage.outputTokens >= 0, "output tokens should be >= 0");
      assert.ok(turn.usage.cacheCreationInputTokens >= 0);
      assert.ok(turn.usage.cacheReadInputTokens >= 0);
    }
  });

  it("handles a non-existent file without throwing", () => {
    const session = parseSessionFile(join(FIXTURES, "does-not-exist.jsonl"));
    assert.equal(session.turns.length, 0);
    assert.equal(session.startedAt, null);
  });

  it("handles empty sessions", () => {
    // The edge-case file has an empty line — session should still parse
    const session = parseSessionFile(join(FIXTURES, "session-edge-cases.jsonl"));
    assert.ok(Array.isArray(session.turns));
  });

  it("parses timestamps correctly", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    assert.ok(session.startedAt?.includes("2026"), "startedAt should be a 2026 timestamp");
  });
});

describe("duplicate message id handling", () => {
  it("counts usage only once for lines sharing the same message id", () => {
    const session = parseSessionFile(join(FIXTURES, "session-duplicate-ids.jsonl"));
    // Two lines share message id msg-api-777 (1000 in / 200 out each) —
    // usage must be counted once: 1000 + 1500 input, 200 + 100 output.
    assert.equal(session.totalUsage.inputTokens, 2500);
    assert.equal(session.totalUsage.outputTokens, 300);
  });

  it("merges tool calls from duplicate lines into a single turn", () => {
    const session = parseSessionFile(join(FIXTURES, "session-duplicate-ids.jsonl"));
    // user + assistant(dedup-merged) + assistant = 3 turns
    assert.equal(session.turns.length, 3);
    const mergedTurn = session.turns[1];
    const toolNames = mergedTurn.toolCalls.map((t) => t.tool).sort();
    assert.deepEqual(toolNames, ["Edit", "Read"]);
  });

  it("clamps negative token counts to zero", () => {
    const session = parseSessionFile(join(FIXTURES, "session-edge-cases.jsonl"));
    for (const turn of session.turns) {
      assert.ok(turn.usage.inputTokens >= 0);
      assert.ok(turn.usage.outputTokens >= 0);
    }
  });
});

describe("findSessionFiles", () => {
  it("finds JSONL files in the fixtures directory", () => {
    const files = findSessionFiles(FIXTURES);
    assert.ok(files.length >= 3, "should find at least 3 fixture files");
    for (const f of files) {
      assert.ok(f.endsWith(".jsonl"), `${f} should end with .jsonl`);
    }
  });

  it("returns empty array for non-existent directory", () => {
    const files = findSessionFiles("/does/not/exist");
    assert.deepEqual(files, []);
  });
});

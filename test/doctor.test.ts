/**
 * Tests for doctor.ts recommendations engine
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { parseSessionFile } from "../src/parser.js";
import { analyzeSession } from "../src/analyze.js";
import { generateRecommendations } from "../src/doctor.js";
import { DEFAULT_PRICING } from "../src/pricing.js";

const FIXTURES = join(process.cwd(), "test", "fixtures");

describe("generateRecommendations", () => {
  it("returns an array (possibly empty) for any session", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    const recs = generateRecommendations(analysis, DEFAULT_PRICING);
    assert.ok(Array.isArray(recs));
  });

  it("detects fat file re-reads", () => {
    // session-refactor reads main.ts multiple times — but only 2 times so threshold is 3
    // session-debug reads pool.ts twice — also below 3
    // Let's create a synthetic analysis with 3+ reads
    const session = parseSessionFile(join(FIXTURES, "session-debug.jsonl"));
    const analysis = analyzeSession(session);
    // Manually inject a fat file with 3+ reads for testing the rule
    const fakeAnalysis = {
      ...analysis,
      fatFiles: [
        { filePath: "/src/big-generated.ts", readCount: 7, tokens: 41_000 },
        ...analysis.fatFiles,
      ],
    };
    const recs = generateRecommendations(fakeAnalysis, DEFAULT_PRICING);
    const fatRec = recs.find((r) => r.title === "Repeatedly-read file");
    assert.ok(fatRec !== undefined, "should detect fat file reads");
    assert.ok(fatRec.detail.includes("7"), "recommendation should cite actual read count");
    assert.ok(fatRec.detail.includes("big-generated.ts"), "recommendation should cite file name");
  });

  it("detects long sessions", () => {
    const session = parseSessionFile(join(FIXTURES, "session-refactor.jsonl"));
    const analysis = analyzeSession(session);
    const fakeAnalysis = { ...analysis, turnCount: 85 };
    const recs = generateRecommendations(fakeAnalysis, DEFAULT_PRICING);
    const longRec = recs.find((r) => r.title === "Long session without compaction");
    assert.ok(longRec !== undefined, "should detect long session");
    assert.ok(longRec.detail.includes("85"), "should cite actual turn count");
    assert.equal(longRec.severity, "error");
  });

  it("detects high cache miss rate", () => {
    // Build a fake session with no cache reads and lots of input tokens
    const session = parseSessionFile(join(FIXTURES, "session-api-build.jsonl"));
    const fakeSession = {
      ...session,
      totalUsage: {
        inputTokens: 100_000,
        outputTokens: 10_000,
        cacheCreationInputTokens: 50_000,
        cacheReadInputTokens: 0, // no cache reads = 100% miss
      },
    };
    const analysis = analyzeSession(session);
    const fakeAnalysis = { ...analysis, session: fakeSession };
    const recs = generateRecommendations(fakeAnalysis, DEFAULT_PRICING);
    const cacheRec = recs.find((r) => r.title === "High cache miss rate");
    assert.ok(cacheRec !== undefined, "should detect high cache miss rate");
    assert.ok(cacheRec.detail.includes("%"), "should cite percentage");
  });

  it("all recommendations have required fields", () => {
    const session = parseSessionFile(join(FIXTURES, "session-api-build.jsonl"));
    const analysis = analyzeSession(session);
    const recs = generateRecommendations(analysis, DEFAULT_PRICING);
    for (const rec of recs) {
      assert.ok(["error", "warn", "info"].includes(rec.severity), "severity must be valid");
      assert.ok(rec.title.length > 0, "title must be non-empty");
      assert.ok(rec.detail.length > 0, "detail must be non-empty");
    }
  });

  it("generates no false positives on a short, clean session", () => {
    const session = parseSessionFile(join(FIXTURES, "session-edge-cases.jsonl"));
    const analysis = analyzeSession(session);
    const recs = generateRecommendations(analysis, DEFAULT_PRICING);
    // Edge case session has very few turns and low tokens — no error-level recs expected
    const errorRecs = recs.filter((r) => r.severity === "error");
    assert.equal(errorRecs.length, 0, "short session should not generate error-level recs");
  });
});

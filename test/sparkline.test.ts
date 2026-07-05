/**
 * Tests for sparkline.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sparkline, burnSparkline } from "../src/sparkline.js";

describe("sparkline", () => {
  it("returns empty string for empty input", () => {
    assert.equal(sparkline([]), "");
  });

  it("returns a single character for a single value", () => {
    const result = sparkline([42]);
    assert.equal(result.length, 1);
  });

  it("returns the correct number of characters", () => {
    const values = [10, 20, 30, 40, 50];
    const result = sparkline(values);
    assert.equal([...result].length, 5, "should have one block per value");
  });

  it("handles all-equal values gracefully", () => {
    const result = sparkline([5, 5, 5, 5]);
    assert.equal([...result].length, 4);
    // All characters should be the same middle block
    const chars = [...result];
    assert.ok(chars.every((c) => c === chars[0]), "all values equal → same block char");
  });

  it("uses higher blocks for larger values", () => {
    const values = [0, 100];
    const result = [...sparkline(values)];
    // First block (0) should be less than or equal to last block (100)
    assert.ok(result[0] <= result[1], "larger value should map to a taller block");
  });

  it("handles a monotonically increasing sequence", () => {
    const values = [1, 2, 4, 8, 16, 32, 64, 128];
    const result = sparkline(values);
    assert.equal([...result].length, values.length);
  });

  it("handles large values without throwing", () => {
    const values = Array.from({ length: 100 }, (_, i) => i * 10_000);
    assert.doesNotThrow(() => sparkline(values));
  });
});

describe("burnSparkline", () => {
  it("generates a burn curve sparkline", () => {
    const cumulative = [1000, 2500, 4200, 7800, 15000, 28000, 52000, 95000];
    const result = burnSparkline(cumulative);
    assert.equal([...result].length, cumulative.length);
  });

  it("returns empty string for empty curve", () => {
    assert.equal(burnSparkline([]), "");
  });
});

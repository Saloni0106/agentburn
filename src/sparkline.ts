/**
 * ASCII sparkline generator.
 * Renders a sequence of numbers as a compact bar chart using Unicode block characters.
 */

const BLOCKS = " ▁▂▃▄▅▆▇█";

/**
 * Generate an ASCII sparkline for an array of numeric values.
 * Returns a string of block characters, one per value.
 */
export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return "▄";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (range === 0) return BLOCKS[4].repeat(values.length);

  return values
    .map((v) => {
      const ratio = (v - min) / range;
      const idx = Math.round(ratio * (BLOCKS.length - 1));
      return BLOCKS[Math.min(idx, BLOCKS.length - 1)];
    })
    .join("");
}

/**
 * Generate a sparkline from cumulative token counts per turn.
 * Each value is total cumulative input tokens up to that turn.
 */
export function burnSparkline(cumulativeTokensPerTurn: number[]): string {
  return sparkline(cumulativeTokensPerTurn);
}

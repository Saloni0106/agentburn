/**
 * Anthropic model pricing table.
 * Last updated: 2026-07-05
 * Source: https://www.anthropic.com/pricing
 *
 * All prices are per million tokens (USD).
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;
  cacheReadPerMTok: number;
}

export const PRICING_TABLE: Record<string, ModelPricing> = {
  // Claude 4 family
  "claude-sonnet-4-5": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  "claude-sonnet-4-6": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  "claude-opus-4-5": {
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cacheWritePerMTok: 18.75,
    cacheReadPerMTok: 1.5,
  },
  "claude-haiku-4-5": {
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheWritePerMTok: 1.25,
    cacheReadPerMTok: 0.1,
  },
  "claude-opus-4-1": {
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cacheWritePerMTok: 18.75,
    cacheReadPerMTok: 1.5,
  },
  "claude-opus-4": {
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cacheWritePerMTok: 18.75,
    cacheReadPerMTok: 1.5,
  },
  "claude-sonnet-4": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  // Claude 3.7 family (real model IDs look like claude-3-7-sonnet-20250219)
  "claude-3-7-sonnet": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  // Claude 3.5 family (real model IDs look like claude-3-5-sonnet-20241022)
  "claude-3-5-sonnet": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  "claude-3-5-haiku": {
    inputPerMTok: 0.8,
    outputPerMTok: 4.0,
    cacheWritePerMTok: 1.0,
    cacheReadPerMTok: 0.08,
  },
  // Claude 3 family
  "claude-3-opus": {
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cacheWritePerMTok: 18.75,
    cacheReadPerMTok: 1.5,
  },
  "claude-3-sonnet": {
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.3,
  },
  "claude-3-haiku": {
    inputPerMTok: 0.25,
    outputPerMTok: 1.25,
    cacheWritePerMTok: 0.3,
    cacheReadPerMTok: 0.03,
  },
};

/** Default pricing used when model is unknown. Falls back to Claude Sonnet rates. */
export const DEFAULT_PRICING: ModelPricing = PRICING_TABLE["claude-sonnet-4-5"];

/**
 * Return the best-matching pricing for a model string.
 * Tries exact match first, then fuzzy prefix match.
 */
export function getPricing(
  model: string | undefined,
  overrides?: { priceIn?: number; priceOut?: number }
): ModelPricing {
  let base: ModelPricing = DEFAULT_PRICING;

  if (model) {
    const normalized = model.toLowerCase().replace(/_/g, "-");
    // Exact match
    if (normalized in PRICING_TABLE) {
      base = PRICING_TABLE[normalized];
    } else {
      // Prefix fuzzy match (longest prefix wins)
      let bestKey = "";
      for (const key of Object.keys(PRICING_TABLE)) {
        if (normalized.startsWith(key) && key.length > bestKey.length) {
          bestKey = key;
        }
      }
      if (bestKey) base = PRICING_TABLE[bestKey];
    }
  }

  return {
    inputPerMTok: overrides?.priceIn ?? base.inputPerMTok,
    outputPerMTok: overrides?.priceOut ?? base.outputPerMTok,
    cacheWritePerMTok: base.cacheWritePerMTok,
    cacheReadPerMTok: base.cacheReadPerMTok,
  };
}

export interface TokenCost {
  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
  totalCost: number;
}

/**
 * Calculate cost from token counts using the given pricing.
 */
export function calculateCost(
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  },
  pricing: ModelPricing
): TokenCost {
  const M = 1_000_000;
  const inputCost = (tokens.inputTokens / M) * pricing.inputPerMTok;
  const outputCost = (tokens.outputTokens / M) * pricing.outputPerMTok;
  const cacheWriteCost =
    (tokens.cacheCreationInputTokens / M) * pricing.cacheWritePerMTok;
  const cacheReadCost =
    (tokens.cacheReadInputTokens / M) * pricing.cacheReadPerMTok;
  const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  return { inputCost, outputCost, cacheWriteCost, cacheReadCost, totalCost };
}

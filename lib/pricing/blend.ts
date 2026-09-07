// Blends Discogs + eBay + AI-photo estimate into one value with a breakdown.
// Priority of intent (per product decision): blend all three when present and
// show the breakdown; Discogs drives matching; AI photo is the fallback when
// nothing else is available.

export type Breakdown = {
  discogs_suggestion_cents: number | null;
  discogs_low_cents: number | null;
  discogs_num_for_sale: number | null;
  ebay_active_median_cents: number | null;
  ebay_count: number | null;
  ai_low_cents: number | null;
  ai_high_cents: number | null;
};

export type Blended = {
  low_cents: number;
  high_cents: number;
  mid_cents: number;
  source: "blended" | "discogs" | "ebay" | "ai_estimate";
  breakdown: Breakdown;
};

export function blendValue(input: {
  discogsSuggestionCents?: number | null;
  discogsLowCents?: number | null;
  discogsNumForSale?: number | null;
  ebayMedianCents?: number | null;
  ebayCount?: number | null;
  aiLowCents?: number | null;
  aiHighCents?: number | null;
  pressingConfident?: boolean | null;
}): Blended {
  const breakdown: Breakdown = {
    discogs_suggestion_cents: input.discogsSuggestionCents ?? null,
    discogs_low_cents: input.discogsLowCents ?? null,
    discogs_num_for_sale: input.discogsNumForSale ?? null,
    ebay_active_median_cents: input.ebayMedianCents ?? null,
    ebay_count: input.ebayCount ?? null,
    ai_low_cents: input.aiLowCents ?? null,
    ai_high_cents: input.aiHighCents ?? null,
  };

  // Collect the "point" estimates each real source provides.
  const points: number[] = [];
  const marketSources: ("discogs" | "ebay")[] = [];
  if (input.discogsSuggestionCents) {
    points.push(input.discogsSuggestionCents);
    marketSources.push("discogs");
  } else if (input.discogsLowCents) {
    points.push(input.discogsLowCents);
    marketSources.push("discogs");
  }
  if (input.ebayMedianCents) {
    points.push(input.ebayMedianCents);
    marketSources.push("ebay");
  }

  // No market data → fall back to the AI photo range.
  if (points.length === 0) {
    const low = input.aiLowCents ?? 0;
    const high = input.aiHighCents ?? 0;
    return {
      low_cents: low,
      high_cents: high,
      mid_cents: Math.round((low + high) / 2),
      source: "ai_estimate",
      breakdown,
    };
  }

  const mid = Math.round(points.reduce((s, p) => s + p, 0) / points.length);

  // Range construction. Discogs is the north star for the *center*, but a single
  // low comp (often a different, cheaper pressing) must not set the floor when
  // the AI has confidently identified a specific pressing. When pressingConfident
  // is true, we build a tighter band centered on the market midpoint and only
  // widen toward the AI range modestly. Otherwise we keep the wider,
  // ambiguity-honest band (min of lows to max of highs).
  const spreadLow = Math.min(...points);
  const spreadHigh = Math.max(...points);

  let low: number;
  let high: number;
  if (input.pressingConfident && points.length > 0) {
    // Center on the market mid; band = ±35% of mid, nudged to include the AI
    // range only if it overlaps sensibly (within 2x of mid). A stray comp far
    // below mid no longer drags the floor.
    const bandLow = Math.round(mid * 0.7);
    const bandHigh = Math.round(mid * 1.35);
    const aiLow = input.aiLowCents && input.aiLowCents > mid * 0.4 ? input.aiLowCents : bandLow;
    const aiHigh = input.aiHighCents && input.aiHighCents < mid * 2.5 ? input.aiHighCents : bandHigh;
    low = Math.max(Math.min(bandLow, aiLow), Math.round(mid * 0.5));
    high = Math.min(Math.max(bandHigh, aiHigh), Math.round(mid * 2));
  } else {
    // Ambiguity-honest wide band (original behavior).
    low = Math.min(spreadLow, input.aiLowCents || spreadLow);
    high = Math.max(spreadHigh, input.aiHighCents || spreadHigh);
  }

  const source =
    marketSources.length > 1
      ? "blended"
      : marketSources[0] === "discogs"
      ? "discogs"
      : "ebay";

  return { low_cents: low, high_cents: high, mid_cents: mid, source, breakdown };
}

export const SOURCE_LABEL: Record<Blended["source"], string> = {
  blended: "Blended — Discogs + eBay",
  discogs: "Discogs marketplace",
  ebay: "eBay active listings (asking)",
  ai_estimate: "Estimated from photos",
};

// Discogs pricing. Requires DISCOGS_TOKEN (server-only) to return marketplace
// numbers. Database (release) data is CC0; marketplace price data is proprietary
// and, per Discogs ToS, requires written permission to charge users for. This
// module returns null when the token is absent so the app degrades to the AI
// estimate rather than breaking.

const UA = "WhirlingDisc/1.0 +https://whirlingdisc.app";

export type DiscogsMatch = {
  releaseId: number;
  releaseUrl: string;
  title: string;
  year: number | null;
};

export type DiscogsPricing = {
  match: DiscogsMatch | null;
  // condition-based suggestion for the graded media condition, in cents
  suggestionCents: number | null;
  // lowest current marketplace listing, in cents
  lowestCents: number | null;
  numForSale: number | null;
};

// Discogs price-suggestion keys use these condition labels.
const DISCOGS_COND: Record<string, string> = {
  M: "Mint (M)",
  NM: "Near Mint (NM or M-)",
  "VG+": "Very Good Plus (VG+)",
  VG: "Very Good (VG)",
  "G+": "Good Plus (G+)",
  G: "Good (G)",
  F: "Fair (F)",
  P: "Poor (P)",
};

// Discogs enforces ~60 authenticated requests/minute per source IP and returns
// HTTP 429 when exceeded. Retry a few times with backoff, honoring Retry-After
// when present, so a busy cataloging session waits briefly rather than silently
// dropping to the photo estimate.
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function dget(path: string, token: string): Promise<any | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`https://api.discogs.com${path}`, {
        headers: { "User-Agent": UA, Authorization: `Discogs token=${token}` },
      });
      if (res.status === 429) {
        if (attempt === MAX_RETRIES) return null;
        const ra = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt;
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) return null;
      const json = await res.json();
      // Proactively pace: if we're almost out of budget this window, pause
      // briefly before the next call so we avoid a 429 entirely.
      const remaining = Number(res.headers.get("x-discogs-ratelimit-remaining"));
      if (Number.isFinite(remaining) && remaining <= 2) {
        await sleep(2000);
      }
      return json;
    } catch {
      if (attempt === MAX_RETRIES) return null;
      await sleep(500 * 2 ** attempt);
    }
  }
  return null;
}

/** Find the best matching release id from artist/title/catalog. */
export async function matchRelease(opts: {
  artist?: string | null;
  title?: string | null;
  catalog_number?: string | null;
  year?: number | null;
}): Promise<DiscogsMatch | null> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) return null;

  const params = new URLSearchParams({ type: "release", per_page: "5" });
  if (opts.artist) params.set("artist", opts.artist);
  if (opts.title) params.set("release_title", opts.title);
  if (opts.catalog_number) params.set("catno", opts.catalog_number);
  if (opts.year) params.set("year", String(opts.year));

  const data = await dget(`/database/search?${params.toString()}`, token);
  const first = data?.results?.[0];
  if (!first?.id) return null;

  return {
    releaseId: first.id,
    releaseUrl: `https://www.discogs.com/release/${first.id}`,
    title: first.title || `${opts.artist} - ${opts.title}`,
    year: first.year ? Number(first.year) : opts.year ?? null,
  };
}

/** Full Discogs pricing for a matched release at a given UI grade. */
export async function getDiscogsPricing(
  match: DiscogsMatch,
  uiGrade: string
): Promise<DiscogsPricing> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) return { match, suggestionCents: null, lowestCents: null, numForSale: null };

  const [stats, suggestions] = await Promise.all([
    dget(`/marketplace/stats/${match.releaseId}`, token),
    dget(`/marketplace/price_suggestions/${match.releaseId}`, token),
  ]);

  let lowestCents: number | null = null;
  let numForSale: number | null = null;
  if (stats) {
    numForSale = typeof stats.num_for_sale === "number" ? stats.num_for_sale : null;
    const v = stats.lowest_price?.value;
    if (typeof v === "number") lowestCents = Math.round(v * 100);
  }

  let suggestionCents: number | null = null;
  if (suggestions) {
    const key = DISCOGS_COND[uiGrade];
    const entry = key ? suggestions[key] : null;
    if (entry?.value != null) suggestionCents = Math.round(Number(entry.value) * 100);
  }

  return { match, suggestionCents, lowestCents, numForSale };
}

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

const onlyDigits = (s?: string | null) => (s ? s.replace(/\D/g, "") : "");
const last4 = (s?: string | null) => {
  const d = onlyDigits(s);
  return d ? d.slice(-4) : "";
};

// Score a Discogs search result against what we asked for. Taking results[0]
// blindly often matched an original pressing to a cheap later reissue (or a
// foreign pressing), which then priced the record wrong. We rank instead.
function scoreResult(
  r: any,
  opts: { catalog_number?: string | null; year?: number | null; country?: string | null }
): number {
  let s = 0;
  // Catalog number is the strongest discriminator between pressings.
  if (opts.catalog_number) {
    const want = onlyDigits(opts.catalog_number);
    const wantL4 = last4(opts.catalog_number);
    const got = Array.isArray(r.catno) ? r.catno.join(" ") : (r.catno || "");
    const gotDigits = onlyDigits(got);
    if (want && gotDigits === want) s += 60;
    else if (wantL4 && last4(got) === wantL4) s += 45;
    else if (wantL4 && gotDigits.includes(wantL4)) s += 20;
  }
  // Year proximity — an original pressing should match its own year closely.
  if (opts.year && r.year) {
    const diff = Math.abs(Number(r.year) - opts.year);
    if (diff === 0) s += 25;
    else if (diff <= 1) s += 15;
    else if (diff <= 3) s += 6;
    else s -= Math.min(20, diff); // penalize a far-off-year (likely a reissue)
  }
  // Country — these are US RCA/Imperial pressings; prefer US, lightly.
  const country = (r.country || "").toString();
  if (opts.country && country) {
    if (country.toLowerCase() === opts.country.toLowerCase()) s += 8;
  } else if (country === "US") {
    s += 4;
  }
  // Having marketplace activity means we can actually price it.
  if (typeof r.community?.have === "number") s += Math.min(5, r.community.have / 50);
  return s;
}

/** Find the best matching release id from artist/title/catalog. */
export async function matchRelease(opts: {
  artist?: string | null;
  title?: string | null;
  catalog_number?: string | null;
  year?: number | null;
  country?: string | null;
}): Promise<DiscogsMatch | null> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) return null;

  const params = new URLSearchParams({ type: "release", per_page: "10" });
  if (opts.artist) params.set("artist", opts.artist);
  if (opts.title) params.set("release_title", opts.title);
  if (opts.catalog_number) params.set("catno", opts.catalog_number);
  // Deliberately do NOT constrain by year in the query — we want to see other
  // pressings so we can score and pick the right one, not force the first hit.

  const data = await dget(`/database/search?${params.toString()}`, token);
  let results: any[] = Array.isArray(data?.results) ? data.results.filter((r: any) => r?.id) : [];

  // If a catalog-number search returned nothing, retry without it (OCR of a
  // catalog number is error-prone) so we still get a title/artist match.
  if (results.length === 0 && opts.catalog_number) {
    const p2 = new URLSearchParams({ type: "release", per_page: "10" });
    if (opts.artist) p2.set("artist", opts.artist);
    if (opts.title) p2.set("release_title", opts.title);
    const d2 = await dget(`/database/search?${p2.toString()}`, token);
    results = Array.isArray(d2?.results) ? d2.results.filter((r: any) => r?.id) : [];
  }
  if (results.length === 0) return null;

  results.sort((a, b) => scoreResult(b, opts) - scoreResult(a, opts));
  const best = results[0];

  return {
    releaseId: best.id,
    releaseUrl: `https://www.discogs.com/release/${best.id}`,
    title: best.title || `${opts.artist} - ${opts.title}`,
    year: best.year ? Number(best.year) : opts.year ?? null,
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

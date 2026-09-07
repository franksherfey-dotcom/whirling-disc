// eBay active listings via the Browse API. Returns asking prices (not sold
// comps — Marketplace Insights is partner-gated). Requires EBAY_CLIENT_ID and
// EBAY_CLIENT_SECRET; returns null when absent so the app degrades gracefully.
// Values here are labeled as ASKING prices everywhere they surface.

let cachedToken: { token: string; exp: number } | null = null;

async function getToken(): Promise<string | null> {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  try {
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 7200) * 1000 };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export type EbayActive = {
  medianCents: number | null;
  count: number;
  sampleUrl: string | null;
};

export async function getEbayActive(query: string): Promise<EbayActive | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const params = new URLSearchParams({
      q: query,
      category_ids: "176985", // Records
      limit: "20",
      filter: "buyingOptions:{FIXED_PRICE|AUCTION}",
    });
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data?.itemSummaries || [];
    const prices = items
      .map((it) => Number(it?.price?.value))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) return { medianCents: null, count: 0, sampleUrl: null };
    const mid = prices[Math.floor(prices.length / 2)];
    return {
      medianCents: Math.round(mid * 100),
      count: prices.length,
      sampleUrl: items[0]?.itemWebUrl || null,
    };
  } catch {
    return null;
  }
}

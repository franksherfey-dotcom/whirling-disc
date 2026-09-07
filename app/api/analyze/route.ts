import { NextRequest, NextResponse } from "next/server";
import { matchRelease, getDiscogsPricing } from "@/lib/pricing/discogs";
import { getEbayActive } from "@/lib/pricing/ebay";
import { blendValue } from "@/lib/pricing/blend";
import { averageGrades, gradingRubricForPrompt } from "@/lib/conditions";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  front?: string;
  back?: string;
  side_a?: string;
  side_b?: string;
  deadwax?: string;
};

const GRADES = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];

function stripDataUrl(d?: string) {
  if (!d) return null;
  return d.includes(",") ? d.split(",")[1] : d;
}

// Build an Anthropic image source from either a base64 data URL / raw base64,
// or an https URL (used when re-appraising records whose photos are already
// stored in Supabase). https URLs are passed by reference; everything else is
// treated as base64 JPEG.
function imageSource(d?: string) {
  if (!d) return null;
  if (d.startsWith("http://") || d.startsWith("https://")) {
    return { type: "url", url: d } as const;
  }
  return { type: "base64", media_type: "image/jpeg", data: stripDataUrl(d)! } as const;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server missing ANTHROPIC_API_KEY" }, { status: 500 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const images = [
    { role: "front cover", src: imageSource(body.front) },
    { role: "back cover", src: imageSource(body.back) },
    { role: "disc side A", src: imageSource(body.side_a) },
    { role: "disc side B", src: imageSource(body.side_b) },
    { role: "deadwax / matrix close-up (the etched runout area between the last groove and the label — READ THE MATRIX NUMBERS HERE to pin down the exact pressing)", src: imageSource(body.deadwax) },
  ].filter((i) => i.src);

  if (images.length === 0) {
    return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  }

  const content: any[] = [];
  images.forEach((img) => {
    content.push({ type: "text", text: `This is the ${img.role}:` });
    content.push({
      type: "image",
      source: img.src,
    });
  });
  content.push({
    type: "text",
    text:
      "You are a vinyl record cataloguer grading to the Goldmine Standard. " +
      "Grade each disc side SEPARATELY by inspecting its surface for scratches, scuffs, and wear, " +
      "using these exact criteria (best to worst):\n" +
      gradingRubricForPrompt() +
      "\nNote: the two disc photos are the two sides of ONE record. Sides may be labeled A/B, A/AA, " +
      "1/2, or similar — read and report the actual printed side names rather than assuming A and B. " +
      "Grade conservatively as a high-volume dealer would under bright light: when a side sits " +
      "between two grades, choose the lower. " +
      "Read the pressing details (label, catalog number) from the disc side A photo if the covers are unclear. " +
      "PRESSING IDENTIFICATION IS CRITICAL — it drives the value. Study the disc label AND the back cover " +
      "closely and extract every pressing-identifying signal you can read: the matrix / runout / deadwax " +
      "numbers etched or stamped near the label, the exact catalog number, label design variations (logo " +
      "style, rim text, colour), rights-society stamps (e.g. GEMA, BIEM, MPS, SACEM, STEMRA, ASCAP), " +
      "'Made in' country of manufacture, pressing-plant marks, and any reissue/remaster wording. " +
      "From these, determine as SPECIFICALLY as possible WHICH pressing this is — e.g. 'original 1969 UK " +
      "first pressing', 'early German pressing', '1980s US reissue' — and whether it is a first pressing or " +
      "a later one. When the evidence supports a specific pressing, COMMIT to it and price that specific " +
      "pressing with a TIGHT range (typical dealer spread for that exact pressing/grade). Only widen the " +
      "range when the evidence genuinely can't distinguish between pressings that differ a lot in value — " +
      "and when you widen it, say why in pressing_details.uncertainty. " +
      "Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:\n" +
      "{\n" +
      '  "artist": string,\n' +
      '  "title": string,\n' +
      '  "year": number | null,\n' +
      '  "label": string | null,\n' +
      '  "catalog_number": string | null,\n' +
      '  "format": string | null,\n' +
      '  "rpm": one of "33", "45", "78" or null (playback speed; a 12-inch LP is usually 33, a 7-inch single is usually 45),\n' +
      '  "country": string | null,\n' +
      '  "genres": string[] (1-3 broad genres like Rock, Jazz, Blues, Soul, Hip Hop, Electronic, Classical, Folk, Reggae, Country),\n' +
      '  "media_condition_a": one of ' + JSON.stringify(GRADES) + ",\n" +
      '  "media_condition_b": one of ' + JSON.stringify(GRADES) + ",\n" +
      '  "side_a_label": string (the side name printed on the first disc photo, e.g. "A", "AA", "1"),\n' +
      '  "side_b_label": string (the side name printed on the second disc photo, e.g. "B", "AA", "2"),\n' +
      '  "disc_count": number (how many discs the release contains; 1 unless the packaging clearly indicates a multi-disc set),\n' +
      '  "sleeve_condition": one of ' + JSON.stringify(GRADES) + ",\n" +
      '  "value_low_usd": number,\n' +
      '  "value_high_usd": number,\n' +
      '  "confidence": number between 0 and 1,\n' +
      '  "summary": string (2-3 sentences identifying this specific pressing — country, year, catalog number, and what makes it notable to a collector; write it like a knowledgeable dealer describing the record),\n' +
      '  "condition_notes": string (2-3 sentences describing the visible wear on the sleeve and disc, and what it means for playability and value),\n' +
      '  "reasoning": {\n' +
      '    "sleeve": string (1-2 sentences: how the sleeve/cover condition affects value),\n' +
      '    "condition": string (1-2 sentences: how the media/disc grade affects value and playback),\n' +
      '    "pressing": string (1-2 sentences: how this specific pressing/variant/label affects value vs other pressings)\n' +
      '  },\n' +
      '  "pressing_details": {\n' +
      '    "identification": string (a specific, dealer-style identification of exactly which pressing this is, e.g. "Early German pressing on Apple Records, catalog 1C 072-04 243, with GEMA rights stamp — not the 1969 UK first pressing"),\n' +
      '    "is_first_pressing": boolean | null (true if this appears to be a first/original pressing, false if a later pressing/reissue, null if genuinely unclear),\n' +
      '    "matrix_runout": string | null (any matrix/runout/deadwax text you can read, or null),\n' +
      '    "country_of_pressing": string | null,\n' +
      '    "distinguishing_marks": string | null (rights-society stamps, label variations, plant marks that pin down the pressing),\n' +
      '    "uncertainty": string | null (if you could NOT narrow to one pressing, name what is ambiguous and what photo would resolve it — e.g. "a clear shot of the deadwax matrix would confirm first vs second pressing"; null if confident)\n' +
      '  }\n' +
      "}\n" +
      "Grade sleeve condition from the cover photos. If a disc side photo is missing, set that side to null. " +
      "Base value on typical sold prices for this pressing at the average of the two disc-side grades. " +
      "If unsure of a metadata field use null, but always give the grades you can and a value range.",
  });

  let data: any;
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1900,
        messages: [{ role: "user", content }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return NextResponse.json({ error: err?.error?.message || "Vision request failed" }, { status: 502 });
    }
    data = await resp.json();
  } catch {
    return NextResponse.json({ error: "Could not reach analysis service" }, { status: 502 });
  }

  const text = (data?.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({ error: "Could not read the record from those photos" }, { status: 422 });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ error: "Analysis returned malformed data" }, { status: 422 });
  }

  const clamp = (g: any) => (GRADES.includes(g) ? g : null);
  parsed.media_condition_a = clamp(parsed.media_condition_a);
  parsed.media_condition_b = clamp(parsed.media_condition_b);
  if (!GRADES.includes(parsed.sleeve_condition)) parsed.sleeve_condition = "VG";
  parsed.genres = Array.isArray(parsed.genres)
    ? parsed.genres.filter((g: any) => typeof g === "string" && g.trim()).slice(0, 3)
    : [];
  parsed.side_a_label = typeof parsed.side_a_label === "string" ? parsed.side_a_label.trim().slice(0, 8) : null;
  parsed.side_b_label = typeof parsed.side_b_label === "string" ? parsed.side_b_label.trim().slice(0, 8) : null;
  parsed.disc_count = Number.isFinite(parsed.disc_count) && parsed.disc_count > 0 ? Math.round(parsed.disc_count) : 1;
  parsed.rpm = ["33", "45", "78"].includes(String(parsed.rpm)) ? String(parsed.rpm) : null;
  parsed.summary = typeof parsed.summary === "string" ? parsed.summary.trim() : null;
  parsed.condition_notes = typeof parsed.condition_notes === "string" ? parsed.condition_notes.trim() : null;
  parsed.reasoning = parsed.reasoning && typeof parsed.reasoning === "object" ? {
    sleeve: typeof parsed.reasoning.sleeve === "string" ? parsed.reasoning.sleeve.trim() : null,
    condition: typeof parsed.reasoning.condition === "string" ? parsed.reasoning.condition.trim() : null,
    pressing: typeof parsed.reasoning.pressing === "string" ? parsed.reasoning.pressing.trim() : null,
  } : null;
  parsed.pressing_details = parsed.pressing_details && typeof parsed.pressing_details === "object" ? {
    identification: typeof parsed.pressing_details.identification === "string" ? parsed.pressing_details.identification.trim() : null,
    is_first_pressing: typeof parsed.pressing_details.is_first_pressing === "boolean" ? parsed.pressing_details.is_first_pressing : null,
    matrix_runout: typeof parsed.pressing_details.matrix_runout === "string" ? parsed.pressing_details.matrix_runout.trim() : null,
    country_of_pressing: typeof parsed.pressing_details.country_of_pressing === "string" ? parsed.pressing_details.country_of_pressing.trim() : null,
    distinguishing_marks: typeof parsed.pressing_details.distinguishing_marks === "string" ? parsed.pressing_details.distinguishing_marks.trim() : null,
    uncertainty: typeof parsed.pressing_details.uncertainty === "string" ? parsed.pressing_details.uncertainty.trim() : null,
  } : null;

  // --- Enrich with real market pricing (degrades to AI estimate if creds absent) ---
  const mediaGrade = averageGrades(parsed.media_condition_a, parsed.media_condition_b);
  const aiLowCents = Math.round((parsed.value_low_usd ?? 0) * 100);
  const aiHighCents = Math.round((parsed.value_high_usd ?? 0) * 100);

  let discogs = null as Awaited<ReturnType<typeof getDiscogsPricing>> | null;
  let discogsUrl: string | null = null;
  try {
    const match = await matchRelease({
      artist: parsed.artist,
      title: parsed.title,
      catalog_number: parsed.catalog_number,
      year: parsed.year,
    });
    if (match) {
      discogsUrl = match.releaseUrl;
      discogs = await getDiscogsPricing(match, mediaGrade);
    }
  } catch {
    /* leave discogs null */
  }

  let ebay = null as Awaited<ReturnType<typeof getEbayActive>> | null;
  try {
    const q = [parsed.artist, parsed.title, parsed.catalog_number].filter(Boolean).join(" ");
    if (q) ebay = await getEbayActive(q);
  } catch {
    /* leave ebay null */
  }

  // The AI is "pressing-confident" when it committed to a first-vs-later
  // determination AND its overall confidence is solid. In that case the blend
  // tightens around the market midpoint instead of letting a stray low comp
  // (often a different, cheaper pressing) widen the floor.
  const pressingConfident =
    !!parsed.pressing_details &&
    parsed.pressing_details.is_first_pressing !== null &&
    (parsed.confidence ?? 0) >= 0.7 &&
    !parsed.pressing_details.uncertainty;

  const blended = blendValue({
    discogsSuggestionCents: discogs?.suggestionCents ?? null,
    discogsLowCents: discogs?.lowestCents ?? null,
    discogsNumForSale: discogs?.numForSale ?? null,
    ebayMedianCents: ebay?.medianCents ?? null,
    ebayCount: ebay?.count ?? null,
    aiLowCents,
    aiHighCents,
    pressingConfident,
  });

  return NextResponse.json({
    ...parsed,
    // Blended value overrides the raw AI range; AI range preserved in breakdown.
    value_low_usd: blended.low_cents / 100,
    value_high_usd: blended.high_cents / 100,
    value_mid_cents: blended.mid_cents,
    value_source: blended.source,
    value_breakdown: blended.breakdown,
    discogs_release_url: discogsUrl,
  });
}

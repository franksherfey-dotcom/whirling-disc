import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

function dbGrade(g: any): string | null {
  const map: Record<string, string> = { "VG+": "VGP", "G+": "GP" };
  if (!g) return null;
  return map[g] || g;
}
function avgGrade(a?: string, b?: string): string | null {
  const order = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];
  const ai = a ? order.indexOf(a) : -1;
  const bi = b ? order.indexOf(b) : -1;
  const vals = [ai, bi].filter((x) => x >= 0);
  if (!vals.length) return null;
  return order[Math.round(vals.reduce((s, x) => s + x, 0) / vals.length)];
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData } = await authed.auth.getUser(token);
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { id?: string; deadwax?: string } = {};
  try { body = await req.json(); } catch {}
  if (!body.id) return NextResponse.json({ error: "Missing record id" }, { status: 400 });

  // Load the record (RLS ensures the caller can only touch records they can access).
  const { data: rec, error: recErr } = await authed.from("records").select("*").eq("id", body.id).single();
  if (recErr || !rec) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  // Gather stored photo URLs.
  const discUrls: string[] = Array.isArray(rec.disc_photo_urls) && rec.disc_photo_urls.length
    ? rec.disc_photo_urls
    : [rec.side_a_url, rec.side_b_url].filter(Boolean);

  // If a new deadwax photo was supplied (data URL), upload it; else reuse stored one.
  let deadwaxUrl: string | null = rec.deadwax_url || null;
  if (body.deadwax && body.deadwax.startsWith("data:")) {
    try {
      const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const storageClient = svc ? createClient(url, svc) : authed;
      const blob = await (await fetch(body.deadwax)).blob();
      const path = `${rec.user_id}/${Date.now()}-deadwax.jpg`;
      const { error: upErr2 } = await storageClient.storage.from("record-covers").upload(path, blob, { contentType: "image/jpeg" });
      if (!upErr2) deadwaxUrl = storageClient.storage.from("record-covers").getPublicUrl(path).data.publicUrl;
    } catch { /* non-fatal */ }
  }

  const origin = new URL(req.url).origin;
  const analyzeRes = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      front: rec.cover_url || undefined,
      back: rec.back_url || undefined,
      side_a: discUrls[0] || undefined,
      side_b: discUrls[1] || undefined,
      deadwax: deadwaxUrl || undefined,
    }),
  });
  const ai = await analyzeRes.json();
  if (!analyzeRes.ok) return NextResponse.json({ error: ai?.error || "Analysis failed" }, { status: 500 });

  const mediaAvg = avgGrade(ai.media_condition_a, ai.media_condition_b);

  // Update analysis-derived fields only; leave photos, purchase info, disc_count untouched.
  const { error: upErr } = await authed.from("records").update({
    artist: ai.artist || rec.artist,
    title: ai.title || rec.title,
    year: ai.year ?? rec.year,
    label: ai.label ?? rec.label,
    catalog_number: ai.catalog_number ?? rec.catalog_number,
    rpm: ai.rpm ?? rec.rpm,
    country: ai.country ?? rec.country,
    genres: Array.isArray(ai.genres) && ai.genres.length ? ai.genres : rec.genres,
    media_condition: dbGrade(mediaAvg) ?? rec.media_condition,
    sleeve_condition: dbGrade(ai.sleeve_condition) ?? rec.sleeve_condition,
    value_low_cents: Math.round((ai.value_low_usd ?? 0) * 100),
    value_high_cents: Math.round((ai.value_high_usd ?? 0) * 100),
    value_source: ai.value_source ?? rec.value_source,
    value_breakdown: ai.value_breakdown ?? rec.value_breakdown,
    ai_confidence: ai.confidence ?? rec.ai_confidence,
    summary: ai.summary ?? rec.summary,
    condition_notes: ai.condition_notes ?? rec.condition_notes,
    reasoning: ai.reasoning ?? rec.reasoning,
    pressing_details: ai.pressing_details ?? null,
    deadwax_url: deadwaxUrl,
  }).eq("id", body.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: body.id });
}

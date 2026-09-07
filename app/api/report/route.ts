import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const METHODOLOGY =
  "Condition is graded to the Goldmine Standard, the record-industry norm, with the media (disc) and " +
  "sleeve graded separately per item. Where both disc sides were inspected, the media grade is the average " +
  "of the two sides. Values are condition-adjusted estimates for the specific pressing identified for each " +
  "item, derived from recent comparable sale prices, rather than a single collection-wide median. Figures are " +
  "stated as a low\u2013high range per item and summed for the collection total. This schedule is a point-in-time " +
  "snapshot: the values and line items below are frozen as of the generation date and document number shown, " +
  "and are not restated if the underlying catalog changes later.";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  // Use the caller's access token so row-level security applies.
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const user = userData.user;

  let body: { purpose?: string; owner_name?: string; owner_email?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const purpose = body.purpose === "estate" ? "estate" : "insurance";

  // Pull the current catalog.
  const { data: records, error: recErr } = await supabase
    .from("records")
    .select("*")
    .order("artist", { ascending: true });
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (!records || records.length === 0) {
    return NextResponse.json({ error: "Add some records before generating a schedule." }, { status: 400 });
  }

  // Freeze line items.
  const line_items = records.map((r: any) => ({
    artist: r.artist,
    title: r.title,
    year: r.year ?? null,
    label: r.label ?? null,
    catalog_number: r.catalog_number ?? null,
    format: r.format ?? null,
    media_condition: r.media_condition ?? null,
    sleeve_condition: r.sleeve_condition ?? null,
    value_low_cents: r.value_low_cents ?? 0,
    value_high_cents: r.value_high_cents ?? 0,
  }));

  const total_low_cents = line_items.reduce((s, i) => s + (i.value_low_cents || 0), 0);
  const total_high_cents = line_items.reduce((s, i) => s + (i.value_high_cents || 0), 0);
  const total_mid_cents = Math.round((total_low_cents + total_high_cents) / 2);

  // Mint an atomic document number.
  const { data: docData, error: docErr } = await supabase.rpc("next_report_doc_number");
  if (docErr || !docData) {
    return NextResponse.json({ error: "Could not assign a document number" }, { status: 500 });
  }
  const doc_number = docData as string;

  const { data: inserted, error: insErr } = await supabase
    .from("reports")
    .insert([
      {
        user_id: user.id,
        doc_number,
        purpose,
        owner_name: body.owner_name || null,
        owner_email: body.owner_email || user.email || null,
        line_items,
        item_count: line_items.length,
        total_low_cents,
        total_high_cents,
        total_mid_cents,
        methodology: METHODOLOGY,
      },
    ])
    .select()
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ report: inserted });
}

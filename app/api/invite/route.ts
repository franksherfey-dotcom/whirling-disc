import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function authedClient(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return { client: createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } }), token };
}

// Create an invite (share code) for the caller's collection.
export async function POST(req: NextRequest) {
  const { client, token } = authedClient(req);
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: userData } = await client.auth.getUser(token);
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { email?: string } = {};
  try { body = await req.json(); } catch {}

  // Find (or create) the caller's own collection to share.
  let { data: cols } = await client
    .from("collections").select("id").eq("owner_id", user.id)
    .order("created_at", { ascending: true }).limit(1);
  let collectionId = cols?.[0]?.id;
  if (!collectionId) {
    const { data: created, error } = await client
      .from("collections").insert([{ owner_id: user.id, name: "My Collection" }])
      .select("id").single();
    if (error || !created) return NextResponse.json({ error: "Could not create collection" }, { status: 500 });
    collectionId = created.id;
  }

  // Generate a short, human-friendly code.
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();

  const { data: invite, error: invErr } = await client
    .from("collection_invites")
    .insert([{
      collection_id: collectionId,
      invited_by: user.id,
      email: body.email?.trim() || null,
      code,
      role: "editor",
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    }])
    .select()
    .single();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
  return NextResponse.json({ invite });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = "record-covers";

// Permanently deletes the signed-in user: their photos in storage, then the
// auth user. Every public table row (profile, collections, records,
// valuations, snapshots, reports, sessions, devices, audit log, invites they
// sent, collaborations) cascades from auth.users.
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!service) return NextResponse.json({ error: "Service key not set" }, { status: 500 });

  const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await authed.auth.getUser(token);
  if (!u?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const uid = u.user.id;

  let body: { confirm?: string } = {};
  try { body = await req.json(); } catch {}
  if (body.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Counts for the deletion log (no personal data is kept in it).
  const count = async (table: string) => {
    const { count: n } = await admin.from(table).select("*", { count: "exact", head: true }).eq("user_id", uid);
    return n ?? 0;
  };
  const [records, valuations, snapshots, reports] = await Promise.all([
    count("records"), count("valuations"), count("record_snapshots"), count("reports"),
  ]);

  // Photos: every upload lives under "<uid>/".
  for (;;) {
    const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(uid, { limit: 1000 });
    if (listErr) return NextResponse.json({ error: `Couldn't list photos: ${listErr.message}` }, { status: 500 });
    if (!files?.length) break;
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(files.map((f) => `${uid}/${f.name}`));
    if (rmErr) return NextResponse.json({ error: `Couldn't delete photos: ${rmErr.message}` }, { status: 500 });
    if (files.length < 1000) break;
  }

  // These two foreign keys don't cascade and would block deleting the user.
  const { error: invErr } = await admin.from("collection_invites").update({ accepted_by: null }).eq("accepted_by", uid);
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
  const { error: collabErr } = await admin.from("collection_collaborators").delete().eq("invited_by", uid);
  if (collabErr) return NextResponse.json({ error: collabErr.message }, { status: 500 });

  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  await admin.from("deletion_log").insert([{
    user_id: uid,
    reason: "user_requested",
    records_deleted: records,
    valuations_deleted: valuations,
    snapshots_deleted: snapshots,
    reports_deleted: reports,
  }]);

  return NextResponse.json({ ok: true });
}

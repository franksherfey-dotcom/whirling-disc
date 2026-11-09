import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Resolve the caller and confirm they may manage a given collection's roster:
// they must OWN the collection, or be an admin. Returns the service client,
// the caller, the target collection id, and whether they're an admin.
async function authorize(req: NextRequest, wantedCollectionId?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Not signed in", status: 401 as const };
  if (!service) return { error: "Service key not set", status: 500 as const };

  const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await authed.auth.getUser(token);
  if (!u?.user) return { error: "Not signed in", status: 401 as const };
  const admin = createClient(url, service);

  const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
  const isAdmin = !!prof?.is_admin;

  // Which collection? Admin may pass one; otherwise use the caller's own.
  let collectionId = wantedCollectionId || null;
  if (!collectionId) {
    const { data: cols } = await admin
      .from("collections").select("id").eq("owner_id", u.user.id)
      .order("created_at", { ascending: true }).limit(1);
    collectionId = cols?.[0]?.id || null;
  }
  if (!collectionId) return { error: "No collection to manage", status: 404 as const };

  const { data: col } = await admin.from("collections").select("owner_id").eq("id", collectionId).maybeSingle();
  if (!col) return { error: "Collection not found", status: 404 as const };
  const isOwner = col.owner_id === u.user.id;
  if (!isOwner && !isAdmin) return { error: "Only the owner or an admin can manage collaborators", status: 403 as const };

  return { admin, caller: u.user, collectionId, isAdmin, isOwner };
}

// GET: the roster for the caller's collection, with names/emails (owner/admin only).
export async function GET(req: NextRequest) {
  const cid = new URL(req.url).searchParams.get("collection_id") || undefined;
  const a = await authorize(req, cid);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { admin, collectionId, caller } = a;

  const { data: rows } = await admin
    .from("collection_collaborators")
    .select("user_id, role, approved_at, invited_at")
    .eq("collection_id", collectionId)
    .order("approved_at", { ascending: true, nullsFirst: false });

  const people = await Promise.all(
    (rows || []).map(async (r) => {
      let email: string | null = null;
      let name: string | null = null;
      try {
        const { data } = await admin.auth.admin.getUserById(r.user_id);
        email = data?.user?.email ?? null;
      } catch {}
      const { data: p } = await admin.from("profiles").select("display_name").eq("id", r.user_id).maybeSingle();
      name = p?.display_name ?? null;
      return {
        user_id: r.user_id,
        email,
        name,
        role: r.role,
        approved: !!r.approved_at,
        is_you: r.user_id === caller.id,
      };
    })
  );

  return NextResponse.json({ collaborators: people });
}

// DELETE: remove a collaborator from the collection (owner/admin only).
export async function DELETE(req: NextRequest) {
  let body: { user_id?: string; collection_id?: string } = {};
  try { body = await req.json(); } catch {}
  const a = await authorize(req, body.collection_id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { admin, collectionId, caller } = a;

  if (!body.user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  if (body.user_id === caller.id) return NextResponse.json({ error: "You can't remove yourself here." }, { status: 400 });

  const { error } = await admin
    .from("collection_collaborators")
    .delete()
    .eq("collection_id", collectionId)
    .eq("user_id", body.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

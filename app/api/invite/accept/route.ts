import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY; // needed to write the collaborator row past RLS
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Please sign in first, then open the invite link again." }, { status: 401 });

  const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData } = await authed.auth.getUser(token);
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: { code?: string } = {};
  try { body = await req.json(); } catch {}
  const code = (body.code || "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Missing invite code" }, { status: 400 });

  // Use service role for the lookup + membership write so RLS doesn't block a
  // not-yet-member from joining. We validate the code ourselves.
  const admin = service ? createClient(url, service) : authed;

  const { data: invite } = await admin
    .from("collection_invites").select("*").eq("code", code).single();
  if (!invite) return NextResponse.json({ error: "That invite code isn't valid." }, { status: 404 });
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "That invite has expired." }, { status: 410 });
  }

  // Already a member? Just succeed.
  const { data: existing } = await admin
    .from("collection_collaborators").select("id")
    .eq("collection_id", invite.collection_id).eq("user_id", user.id).maybeSingle();

  if (!existing) {
    const { error: insErr } = await admin.from("collection_collaborators").insert([{
      collection_id: invite.collection_id,
      user_id: user.id,
      role: invite.role || "editor",
      invited_by: invite.invited_by,
      approved_at: new Date().toISOString(),
    }]);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await admin.from("collection_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id);

  return NextResponse.json({ ok: true, collection_id: invite.collection_id });
}

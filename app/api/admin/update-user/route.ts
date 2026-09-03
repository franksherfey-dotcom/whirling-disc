import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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
  const admin = createClient(url, service);
  const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
  if (!prof?.is_admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: { id?: string; action?: string } = {};
  try { body = await req.json(); } catch {}
  if (!body.id || !body.action) return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  if (body.id === u.user.id) return NextResponse.json({ error: "You can't modify your own admin account here." }, { status: 400 });

  const patch: Record<string, any> = {};
  if (body.action === "make_pro") patch.entitlement = "pro";
  else if (body.action === "make_free") patch.entitlement = "free";
  else if (body.action === "suspend") patch.suspended = true;
  else if (body.action === "unsuspend") patch.suspended = false;
  else if (body.action === "force_password") patch.must_change_password = true;
  else if (body.action === "make_admin") patch.is_admin = true;
  else if (body.action === "remove_admin") patch.is_admin = false;
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const { error } = await admin.from("profiles").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

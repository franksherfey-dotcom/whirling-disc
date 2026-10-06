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

  let body: { id?: string } = {};
  try { body = await req.json(); } catch {}
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: target } = await admin.auth.admin.getUserById(body.id);
  const email = target?.user?.email;
  if (!email) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const origin = new URL(req.url).origin;
  const { error: genErr } = await admin.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/account/password?forced=1`, shouldCreateUser: false },
  });
  if (genErr) return NextResponse.json({ error: genErr.message }, { status: 500 });

  await admin.from("profiles").update({ must_change_password: true }).eq("id", body.id);
  return NextResponse.json({ ok: true, email });
}

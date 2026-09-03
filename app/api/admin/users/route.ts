import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Not signed in", status: 401 as const };
  if (!service) return { error: "SUPABASE_SERVICE_ROLE_KEY not set", status: 500 as const };
  const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await authed.auth.getUser(token);
  if (!u?.user) return { error: "Not signed in", status: 401 as const };
  const admin = createClient(url, service);
  const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
  if (!prof?.is_admin) return { error: "Admins only", status: 403 as const };
  return { admin, callerId: u.user.id };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { admin, callerId } = gate;

  // Auth users (for email, created_at, last_sign_in_at)
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = authList?.users || [];

  // Profiles
  const { data: profiles } = await admin.from("profiles").select("id, entitlement, is_admin, suspended, must_change_password");
  const pById = new Map((profiles || []).map((p: any) => [p.id, p]));

  // Record counts per user
  const { data: recs } = await admin.from("records").select("user_id");
  const counts = new Map<string, number>();
  for (const r of recs || []) counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1);

  const rows = users.map((u) => {
    const p: any = pById.get(u.id) || {};
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      confirmed: !!u.email_confirmed_at,
      entitlement: p.entitlement || "free",
      is_admin: !!p.is_admin,
      suspended: !!p.suspended,
      must_change_password: !!p.must_change_password,
      records: counts.get(u.id) || 0,
      is_self: u.id === callerId,
    };
  }).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const stats = {
    total: rows.length,
    pro: rows.filter((r) => r.entitlement !== "free").length,
    free: rows.filter((r) => r.entitlement === "free").length,
    suspended: rows.filter((r) => r.suspended).length,
    totalRecords: (recs || []).length,
    activeWeek: rows.filter((r) => r.last_sign_in_at && (Date.now() - new Date(r.last_sign_in_at).getTime()) < 7 * 864e5).length,
  };

  return NextResponse.json({ users: rows, stats });
}

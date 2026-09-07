import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not set in the environment. Add it in Vercel to enable provisioning." },
      { status: 500 }
    );
  }

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Verify the caller and confirm they are an admin.
  const authed = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData } = await authed.auth.getUser(token);
  const caller = userData?.user;
  if (!caller) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createClient(url, service);

  const { data: callerProfile } = await admin
    .from("profiles").select("is_admin").eq("id", caller.id).maybeSingle();
  if (!callerProfile?.is_admin) {
    return NextResponse.json({ error: "Only an admin can provision accounts." }, { status: 403 });
  }

  let body: { email?: string; tempPassword?: string } = {};
  try { body = await req.json(); } catch {}
  const email = (body.email || "").trim().toLowerCase();
  const tempPassword = (body.tempPassword || "").trim() || "whirling123";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // Does a user with this email already exist? (list + find; admin API has no get-by-email)
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === email);

  let userId: string;
  let created = false;

  if (existing) {
    userId = existing.id;
  } else {
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // skip the confirmation email; they can sign in immediately
    });
    if (createErr || !newUser?.user) {
      return NextResponse.json({ error: createErr?.message || "Could not create user" }, { status: 500 });
    }
    userId = newUser.user.id;
    created = true;
  }

  // Ensure a profile exists, set Pro, force password change on first login.
  await admin.from("profiles").upsert({
    id: userId,
    entitlement: "pro",
    must_change_password: true,
  }, { onConflict: "id" });

  return NextResponse.json({
    ok: true,
    created,
    email,
    tempPassword,
    message: created
      ? `Created ${email} with full Pro access.`
      : `${email} already existed — set to full Pro access.`,
  });
}

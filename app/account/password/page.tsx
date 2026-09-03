"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Record } from "../../components/Record";

function ChangePasswordInner() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forced, setForced] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("forced") === "1") setForced(true);
  }, [params]);

  const submit = async () => {
    setError(null);
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2) { setError("Those two passwords don't match."); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/signin"); return; }

      const { error: upErr } = await supabase.auth.updateUser({ password: pw });
      if (upErr) throw new Error(upErr.message);

      // Clear the must-change flag now that they've set their own password.
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);

      router.replace("/records");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12">
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>
        {forced ? "One quick step" : "Account"}
      </p>
      <h1 className="font-display text-3xl mb-2" style={{ color: "var(--wd-text)" }}>
        {forced ? "Set your password" : "Change password"}
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
        {forced
          ? "You're signed in with a temporary password. Choose your own to finish setting up your account."
          : "Choose a new password for your account."}
      </p>

      <label className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>New password</label>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters"
        className="w-full mt-2 mb-4 px-5 py-3 rounded-xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />

      <label className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Confirm new password</label>
      <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Type it again"
        className="w-full mt-2 mb-4 px-5 py-3 rounded-xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />

      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>{error}</div>}

      <button onClick={submit} disabled={busy} className="w-full py-3.5 rounded-2xl font-eyebrow text-sm flex items-center justify-center disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
        {busy ? <Record size={20} spinning /> : "Save password"}
      </button>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<div className="py-28 flex justify-center"><Record size={48} spinning /></div>}>
      <ChangePasswordInner />
    </Suspense>
  );
}

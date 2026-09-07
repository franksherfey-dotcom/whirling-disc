"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim()) { setError("Enter your email."); return; }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/account/password`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (err) throw new Error(err.message);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="flex justify-center mb-6"><Record size={48} /></div>
        <h1 className="font-display text-3xl mb-3" style={{ color: "var(--wd-text)" }}>Check your email</h1>
        <p className="text-sm" style={{ color: "var(--wd-text-dim)" }}>
          If an account exists for {email}, we've sent a link to reset your password. It may take a minute to arrive.
        </p>
        <Link href="/signin" className="font-eyebrow text-xs mt-6 inline-block" style={{ color: "var(--wd-gold)" }}>← Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16">
      <h1 className="font-display text-3xl mb-2" style={{ color: "var(--wd-text)" }}>Reset your password</h1>
      <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
        Enter your email and we'll send you a link to set a new password.
      </p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
        className="w-full mb-4 px-5 py-3 rounded-xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />
      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>{error}</div>}
      <button onClick={submit} disabled={busy} className="w-full py-3.5 rounded-2xl font-eyebrow text-sm flex items-center justify-center disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
        {busy ? <Record size={20} spinning /> : "Send reset link"}
      </button>
      <Link href="/signin" className="font-eyebrow text-xs mt-6 inline-block" style={{ color: "var(--wd-text-dim)" }}>← Back to sign in</Link>
    </div>
  );
}

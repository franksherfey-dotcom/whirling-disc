"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";
import Link from "next/link";

const inputStyle = { background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" };
const errorStyle = { background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" };

// Reset by code: the email carries a one-time code the user types here, so the
// reset finishes in whatever browser or app asked for it. (A link alone breaks
// in the iOS app, because Mail opens it in Safari, which can't complete the
// app's sign-in.) The email's link still works on the web as a fallback.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const send = async () => {
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

  const verify = async () => {
    setError(null);
    const token = code.replace(/\D/g, "");
    if (token.length < 6) { setError("Enter the code from the email."); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "recovery" });
      if (err) throw new Error("That code didn't work. Check it, or use the newest email if you requested more than one.");
      router.replace("/account/password");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-md mx-auto py-16">
        <div className="flex justify-center mb-6"><Record size={48} /></div>
        <h1 className="font-display text-3xl mb-2 text-center" style={{ color: "var(--wd-text)" }}>Check your email</h1>
        <p className="text-sm mb-8 text-center" style={{ color: "var(--wd-text-dim)" }}>
          If an account exists for {email}, we&apos;ve sent a code to reset your password. Enter it below. It may take a minute to arrive.
        </p>
        <input
          type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
          value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from the email"
          className="w-full mb-4 px-5 py-3 rounded-xl text-lg tracking-[0.3em] text-center" style={inputStyle}
        />
        {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={errorStyle}>{error}</div>}
        <button onClick={verify} disabled={busy} className="w-full py-3.5 rounded-2xl font-eyebrow text-sm flex items-center justify-center disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
          {busy ? <Record size={20} spinning /> : "Continue"}
        </button>
        <div className="flex justify-between mt-6">
          <button onClick={() => { setSent(false); setCode(""); setError(null); }} className="font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)" }}>Use a different email</button>
          <Link href="/signin" className="font-eyebrow text-xs" style={{ color: "var(--wd-gold)" }}>← Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16">
      <h1 className="font-display text-3xl mb-2" style={{ color: "var(--wd-text)" }}>Reset your password</h1>
      <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
        Enter your email and we&apos;ll send you a code to set a new password.
      </p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
        className="w-full mb-4 px-5 py-3 rounded-xl text-sm" style={inputStyle} />
      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={errorStyle}>{error}</div>}
      <button onClick={send} disabled={busy} className="w-full py-3.5 rounded-2xl font-eyebrow text-sm flex items-center justify-center disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
        {busy ? <Record size={20} spinning /> : "Send reset code"}
      </button>
      <Link href="/signin" className="font-eyebrow text-xs mt-6 inline-block" style={{ color: "var(--wd-text-dim)" }}>← Back to sign in</Link>
    </div>
  );
}

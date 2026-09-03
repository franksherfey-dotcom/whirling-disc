"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";
import Link from "next/link";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split("@")[0] },
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/records` : undefined,
        },
      });
      if (signUpError) throw signUpError;
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-160px)]">
        <div className="w-full max-w-md rounded-3xl p-8 sm:p-10 text-center" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <div className="flex justify-center mb-5"><Record size={48} /></div>
          <h1 className="font-display text-3xl mb-3" style={{ color: "var(--wd-text)" }}>Check your email</h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>
            We sent a confirmation link to <span style={{ color: "var(--wd-text)" }}>{email}</span>. Click it to
            activate your crate, then sign in.
          </p>
          <Link href="/signin" className="inline-block mt-6 font-eyebrow text-xs px-5 py-3 rounded-full" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-160px)]">
      <div className="w-full max-w-md rounded-3xl p-8 sm:p-10" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <div className="flex items-center gap-2 mb-6">
          <Record size={20} />
          <span className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Start your crate</span>
        </div>
        <h1 className="font-display text-5xl mb-3" style={{ color: "var(--wd-text)" }}>Create account</h1>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>
          Free to start — catalog up to three records, then upgrade for the full collection.
        </p>

        {error && (
          <div className="px-4 py-3 rounded-xl mb-6 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-3">
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name (optional)" className="wd-input w-full px-5 py-4 rounded-2xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="wd-input w-full px-5 py-4 rounded-2xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" required className="wd-input w-full px-5 py-4 rounded-2xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />
          <button type="submit" disabled={isLoading} className="w-full py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 disabled:opacity-70" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
            {isLoading ? <Record size={20} spinning /> : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: "var(--wd-text-faint)" }}>
          Already have a crate?{" "}
          <Link href="/signin" style={{ color: "var(--wd-gold)" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

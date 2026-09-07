"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      // If they arrived via an invite link, send them back to accept it.
      let pending: string | null = null;
      try { pending = sessionStorage.getItem("pending_invite"); } catch {}
      router.push(pending ? `/join/${pending}` : "/records");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-160px)]">
      <div
        className="w-full max-w-md rounded-3xl p-8 sm:p-10"
        style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}
      >
        <div className="flex items-center gap-2 mb-6">
          <Record size={20} />
          <span className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>
            Your Crate
          </span>
        </div>

        <h1 className="font-display text-5xl mb-3" style={{ color: "var(--wd-text)" }}>
          Welcome back
        </h1>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>
          Every collection is private to the account that created it.
        </p>

        {error && (
          <div
            className="px-4 py-3 rounded-xl mb-6 text-sm"
            style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="wd-input w-full px-5 py-4 rounded-2xl text-sm"
            style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
            placeholder="you@example.com"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="wd-input w-full px-5 py-4 rounded-2xl text-sm"
            style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
            placeholder="Password"
            required
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-70"
            style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}
          >
            {isLoading ? <Record size={20} spinning /> : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: "var(--wd-text-faint)" }}>
          New here?{" "}
          <a href="/signup" style={{ color: "var(--wd-gold)" }}>Create your crate</a>
        </p>
        <p className="text-center text-sm mt-2">
          <a href="/forgot-password" style={{ color: "var(--wd-text-faint)" }}>Forgot your password?</a>
        </p>
      </div>
    </div>
  );
}

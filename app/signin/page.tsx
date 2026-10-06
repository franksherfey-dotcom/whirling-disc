"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";
import { AppleSignIn } from "../components/AppleSignIn";
import { biometricLabel, isQuietPasskeyError, platformAuthenticatorAvailable } from "@/lib/passkeys";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioLabel, setBioLabel] = useState("Face ID");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setBioLabel(biometricLabel());
    (async () => {
      if (!(await platformAuthenticatorAvailable())) return;
      // Only offer the button when the server actually has passkeys on.
      const { error } = await supabase.auth.passkey.startAuthentication();
      setBioAvailable(!error);
    })();
  }, []);

  const afterSignIn = () => {
    // If they arrived via an invite link, send them back to accept it.
    let pending: string | null = null;
    try { pending = sessionStorage.getItem("pending_invite"); } catch {}
    router.push(pending ? `/join/${pending}` : "/records");
  };

  // Passkey sign-in: the phone shows its own account picker + biometric
  // prompt, so we never ask for an email here.
  const handlePasskey = async () => {
    setBioBusy(true);
    setError(null);
    try {
      const { error: pkErr } = await supabase.auth.signInWithPasskey();
      if (pkErr) {
        if ((pkErr as { code?: string }).code === "passkey_disabled") { setBioAvailable(false); return; }
        if (isQuietPasskeyError(pkErr)) return;
        throw pkErr;
      }
      afterSignIn();
    } catch (err) {
      if (!isQuietPasskeyError(err)) {
        setError(`${bioLabel} sign-in didn't work. Use your password below; you can turn ${bioLabel} on again afterwards.`);
      }
    } finally {
      setBioBusy(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      afterSignIn();
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

        <AppleSignIn onSignedIn={afterSignIn} />

        {bioAvailable && (
          <>
            <button
              type="button"
              onClick={handlePasskey}
              disabled={bioBusy || isLoading}
              className="w-full py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-70 mb-4"
              style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}
            >
              {bioBusy ? <Record size={20} spinning /> : <>Sign in with {bioLabel}</>}
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1" style={{ height: 1, background: "var(--wd-border)" }} />
              <span className="font-eyebrow text-[10px]" style={{ color: "var(--wd-text-faint)" }}>or use your password</span>
              <div className="flex-1" style={{ height: 1, background: "var(--wd-border)" }} />
            </div>
          </>
        )}

        <form onSubmit={handleSignIn} className="space-y-3">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="wd-input w-full px-5 py-4 rounded-2xl text-sm"
            style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
            placeholder="you@example.com"
            required
          />
          <input
            type="password"
            autoComplete="current-password"
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
            style={bioAvailable
              ? { background: "var(--wd-surface-2)", color: "var(--wd-text)", border: "1px solid var(--wd-border)" }
              : { background: "var(--wd-gold)", color: "#0d0d0d" }}
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

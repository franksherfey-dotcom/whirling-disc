"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { biometricLabel, isQuietPasskeyError, nudgeDismissed, platformAuthenticatorAvailable, setNudge } from "@/lib/passkeys";

// After someone signs in with a password, offer to turn on Face ID (or the
// device's equivalent) so they never type it again. Shows once per device
// until they enrol or dismiss it; can always be revisited from the account
// page. Never shown on public pages or mid-password-change.
const QUIET_PATHS = ["/", "/signin", "/signup", "/forgot-password", "/account/password"];

export function PasskeyNudge() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("Face ID");

  useEffect(() => {
    let active = true;
    setShow(false);
    if (QUIET_PATHS.includes(pathname) || pathname.startsWith("/join/")) return;
    if (nudgeDismissed()) return;
    (async () => {
      if (!(await platformAuthenticatorAvailable())) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !active) return;
      // Skip users mid temp-password flow; the guard is about to redirect them.
      const { data: profile } = await supabase.from("profiles").select("must_change_password").eq("id", session.user.id).maybeSingle();
      if (!active || profile?.must_change_password) return;
      const { data: keys, error } = await supabase.auth.passkey.list();
      if (!active) return;
      if (error) return; // feature off server-side, or transient; stay quiet
      if ((keys?.length ?? 0) > 0) { setNudge("done"); return; }
      setLabel(biometricLabel());
      setShow(true);
    })();
    return () => { active = false; };
  }, [pathname]);

  if (!show) return null;

  const enrol = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: regErr } = await supabase.auth.registerPasskey();
      if (regErr) {
        if (isQuietPasskeyError(regErr)) return; // cancelled: leave the card up
        throw regErr;
      }
      setNudge("done");
      setDone(true);
      setTimeout(() => setShow(false), 2500);
    } catch (e) {
      if (!isQuietPasskeyError(e)) setError(`Couldn't turn on ${label}. You can try again from your account page.`);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => { setNudge("dismissed"); setShow(false); };

  return (
    <div className="max-w-2xl mx-auto mb-6">
      <div className="rounded-2xl p-5" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-gold)" }}>
        {done ? (
          <p className="text-sm" style={{ color: "var(--wd-gold)" }}>✓ {label} is on. Next time, one tap and you're in.</p>
        ) : (
          <>
            <p className="font-eyebrow text-xs mb-1" style={{ color: "var(--wd-gold)" }}>Skip the password next time</p>
            <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>
              Turn on {label} for Whirling Disc and you'll never type a password on this device again.
              It stays in your device's keychain; we never see it.
            </p>
            {error && <p className="text-xs mb-3" style={{ color: "#f0a89f" }}>{error}</p>}
            <div className="flex gap-2">
              <button onClick={enrol} disabled={busy} className="flex-1 py-3 rounded-xl font-eyebrow text-xs disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
                {busy ? "Waiting for your device…" : `Turn on ${label}`}
              </button>
              <button onClick={dismiss} disabled={busy} className="px-5 py-3 rounded-xl font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

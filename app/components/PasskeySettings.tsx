"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { biometricLabel, isQuietPasskeyError, platformAuthenticatorAvailable, setNudge } from "@/lib/passkeys";

type Key = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

// Account-page control for passkeys: shows what's enrolled, lets the user add
// this device or remove one. Hidden entirely if the server has the feature off.
export function PasskeySettings() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [supported, setSupported] = useState(false);
  const [available, setAvailable] = useState(true); // false when server says passkey_disabled
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [label, setLabel] = useState("Face ID");

  const load = async () => {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) { setAvailable(false); return; }
    setKeys((data ?? []) as Key[]);
  };

  useEffect(() => {
    setLabel(biometricLabel());
    platformAuthenticatorAvailable().then(setSupported);
    load();
  }, []);

  if (!available) return null;

  const add = async () => {
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) { if (!isQuietPasskeyError(error)) throw error; return; }
      setNudge("done");
      setMsg(`${label} is on for this device.`);
      await load();
    } catch (e) {
      if (!isQuietPasskeyError(e)) setMsg(`Couldn't turn on ${label}: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
      if (error) throw error;
      await load();
    } catch (e) {
      setMsg(`Couldn't remove it: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };

  const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString() : null);

  return (
    <div className="mt-10 pt-8" style={{ borderTop: "1px solid var(--wd-border)" }}>
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Sign in without a password</p>
      <h2 className="font-display text-2xl mb-2" style={{ color: "var(--wd-text)" }}>{label}</h2>
      <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>
        Each device you turn this on for gets its own key, stored in that device's keychain. Remove one if you lose the device.
      </p>

      {keys && keys.length > 0 && (
        <div className="space-y-2 mb-4">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
              <div>
                <p className="text-sm" style={{ color: "var(--wd-text)" }}>{k.friendly_name || "This device"}</p>
                <p className="text-[11px]" style={{ color: "var(--wd-text-faint)" }}>
                  Added {fmt(k.created_at)}{k.last_used_at ? ` · last used ${fmt(k.last_used_at)}` : ""}
                </p>
              </div>
              <button onClick={() => remove(k.id)} disabled={busy} className="font-eyebrow text-[11px] px-3 py-1.5 rounded-full disabled:opacity-60" style={{ color: "#f0a89f", border: "1px solid rgba(176,36,24,0.35)" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {supported ? (
        <button onClick={add} disabled={busy} className="w-full py-3.5 rounded-2xl font-eyebrow text-sm disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
          {busy ? "Waiting for your device…" : keys && keys.length > 0 ? `Add ${label} on this device too` : `Turn on ${label}`}
        </button>
      ) : (
        <p className="text-xs" style={{ color: "var(--wd-text-faint)" }}>This browser can't do {label}. Open Whirling Disc on your phone to turn it on there.</p>
      )}
      {msg && <p className="text-xs mt-3" style={{ color: "var(--wd-gold)" }}>{msg}</p>}
    </div>
  );
}

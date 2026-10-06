"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { appleProviderEnabled, isIOSApp } from "@/lib/native";
import { Record } from "./Record";

const BUNDLE_ID = "com.franksherfey.whirlingdisc";

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Inside the iOS app we use the native Apple sheet and hand the identity token
// to Supabase. On the web we use Supabase's Apple OAuth redirect, which also
// needs a Services ID, so it stays off unless NEXT_PUBLIC_APPLE_WEB_SIGNIN=1.
export function AppleSignIn({ onSignedIn, label = "Sign in with Apple" }: { onSignedIn: () => void; label?: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const allowed = isIOSApp() || process.env.NEXT_PUBLIC_APPLE_WEB_SIGNIN === "1";
    if (!allowed) return;
    appleProviderEnabled().then(setShow);
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!isIOSApp()) {
        const { error: oauthErr } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: { redirectTo: `${window.location.origin}/records` },
        });
        if (oauthErr) throw oauthErr;
        return; // browser navigates away
      }

      const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
      const rawNonce = randomNonce();
      const { response } = await SignInWithApple.authorize({
        clientId: BUNDLE_ID,
        redirectURI: "",
        scopes: "email name",
        nonce: await sha256Hex(rawNonce),
      });
      const { data, error: idErr } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: response.identityToken,
        nonce: rawNonce,
      });
      if (idErr) throw idErr;

      // Apple only shares the name on the very first authorization.
      const first = response.givenName?.trim();
      const last = response.familyName?.trim();
      if (data.user && (first || last)) {
        const patch: { [k: string]: string } = {};
        if (first) { patch.first_name = first; patch.display_name = first; }
        if (last) patch.last_name = last;
        await supabase.auth.updateUser({ data: patch });
        await supabase.from("profiles").update(patch).eq("id", data.user.id);
      }
      onSignedIn();
    } catch (err) {
      const msg = (err as Error)?.message || "";
      // User closed the Apple sheet: not an error worth showing.
      if (/cancel|1001/i.test(msg)) return;
      setError(msg || "Sign in with Apple didn't work. Try again or use your email.");
    } finally {
      setBusy(false);
    }
  };

  if (!show) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="w-full py-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
        style={{ background: "#fff", color: "#000" }}
      >
        {busy ? <Record size={20} spinning /> : (
          <>
            <svg width="16" height="19" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
              <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-57-156-127C44 791 0 671 0 557c0-183 119-280 236-280 62 0 114 41 153 41 37 0 95-43 166-43 27 0 124 2 188 66zM554 160c29-35 50-83 50-131 0-7-1-14-2-19-48 2-104 32-138 72-27 30-52 79-52 128 0 7 1 15 2 17 3 1 8 1 13 1 43 0 97-29 127-68z" />
            </svg>
            {label}
          </>
        )}
      </button>
      {error && <p className="text-xs mt-2 text-center" style={{ color: "#f0a89f" }}>{error}</p>}
    </div>
  );
}

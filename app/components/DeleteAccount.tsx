"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Record } from "./Record";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Couldn't delete your account.");
      await supabase.auth.signOut();
      router.replace("/?deleted=1");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mt-12 pt-8" style={{ borderTop: "1px solid var(--wd-border)" }}>
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Danger zone</p>
      <h2 className="font-display text-2xl mb-2" style={{ color: "var(--wd-text)" }}>Delete account</h2>
      <p className="text-sm mb-4" style={{ color: "var(--wd-text-dim)" }}>
        Permanently deletes your account, every record and photo in your crate, valuations, reports, and
        shared-crate access. This can&apos;t be undone.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full py-3.5 rounded-2xl font-eyebrow text-sm" style={{ color: "#f0a89f", border: "1px solid rgba(176,36,24,0.55)", background: "rgba(176,36,24,0.08)" }}>
          Delete my account
        </button>
      ) : (
        <>
          <label className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Type DELETE to confirm</label>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" autoCorrect="off" placeholder="DELETE"
            className="w-full mt-2 mb-4 px-5 py-3 rounded-xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />
          {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>{error}</div>}
          <div className="flex gap-3">
            <button onClick={() => { setOpen(false); setConfirm(""); setError(null); }} disabled={busy} className="flex-1 py-3.5 rounded-2xl font-eyebrow text-sm" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
              Cancel
            </button>
            <button onClick={remove} disabled={busy || confirm.trim() !== "DELETE"} className="flex-1 py-3.5 rounded-2xl font-eyebrow text-sm flex items-center justify-center disabled:opacity-50" style={{ background: "#b02418", color: "#fff" }}>
              {busy ? <Record size={20} spinning /> : "Delete forever"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

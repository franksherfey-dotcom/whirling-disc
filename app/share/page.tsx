"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";
import Link from "next/link";

export default function SharePage() {
  const [code, setCode] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    loadCollaborators();
  }, []);

  const loadCollaborators = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: cols } = await supabase.from("collections").select("id").eq("owner_id", user.id).limit(1);
    const cid = cols?.[0]?.id;
    if (!cid) return;
    const { data } = await supabase
      .from("collection_collaborators")
      .select("user_id, role, approved_at")
      .eq("collection_id", cid);
    setCollaborators(data || []);
  };

  const createInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not create invite");
      setCode(json.invite.code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const link = code ? `${origin}/join/${code}` : "";

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/records" className="font-eyebrow text-xs mb-6 inline-block" style={{ color: "var(--wd-text-dim)" }}>← Back to crate</Link>
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Share your catalog</p>
      <h1 className="font-display text-4xl mb-2" style={{ color: "var(--wd-text)" }}>Invite a collaborator</h1>
      <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
        A collaborator gets their own login but shares your catalog — they can add, edit, and value records
        alongside you. Perfect for a partner working the same collection.
      </p>

      <div className="rounded-2xl p-6 mb-6" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <label className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Their email (optional)</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="partner@example.com"
          className="wd-input w-full mt-2 mb-4 px-5 py-3 rounded-xl text-sm"
          style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
        />
        {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>{error}</div>}
        <button onClick={createInvite} disabled={busy} className="w-full py-3.5 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
          {busy ? <Record size={20} spinning /> : "Create invite link"}
        </button>

        {code && (
          <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--wd-border)" }}>
            <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Share this link</p>
            <div className="flex items-center gap-2">
              <input readOnly value={link} className="flex-1 px-4 py-3 rounded-xl text-sm" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} />
              <button onClick={() => navigator.clipboard?.writeText(link)} className="px-4 py-3 rounded-xl font-eyebrow text-xs" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>Copy</button>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--wd-text-faint)" }}>
              Or share the code: <span style={{ color: "var(--wd-gold)", fontWeight: 600 }}>{code}</span>. Send it however you like — text, email, whatever.
            </p>
          </div>
        )}
      </div>

      {collaborators.length > 0 && (
        <div>
          <p className="font-eyebrow text-xs mb-3" style={{ color: "var(--wd-text-faint)" }}>On this catalog</p>
          <div className="space-y-2">
            {collaborators.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 rounded-xl" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
                <span className="text-sm" style={{ color: "var(--wd-text)" }}>{c.user_id.slice(0, 8)}…</span>
                <span className="font-eyebrow text-[10px]" style={{ color: c.approved_at ? "var(--wd-gold)" : "var(--wd-text-faint)" }}>
                  {c.approved_at ? c.role : "pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Record } from "../../components/Record";
import Link from "next/link";

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const [status, setStatus] = useState<"checking" | "need-signin" | "joining" | "done" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Stash the code so signin can bring them back.
        try { sessionStorage.setItem("pending_invite", code); } catch {}
        setStatus("need-signin");
        return;
      }
      join(session.access_token);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const join = async (token: string) => {
    setStatus("joining");
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not join");
      try { sessionStorage.removeItem("pending_invite"); } catch {}
      setStatus("done");
      setTimeout(() => router.push("/records"), 1200);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  };

  return (
    <div className="max-w-md mx-auto py-20 text-center">
      <div className="flex justify-center mb-6"><Record size={56} spinning={status === "joining" || status === "checking"} /></div>
      {status === "checking" && <p style={{ color: "var(--wd-text-dim)" }}>Checking your invite…</p>}
      {status === "joining" && <p style={{ color: "var(--wd-text-dim)" }}>Adding you to the catalog…</p>}
      {status === "done" && <p className="font-display text-2xl" style={{ color: "var(--wd-text)" }}>You're in! Taking you to the crate…</p>}
      {status === "need-signin" && (
        <>
          <h1 className="font-display text-3xl mb-3" style={{ color: "var(--wd-text)" }}>You've been invited</h1>
          <p className="text-sm mb-6" style={{ color: "var(--wd-text-dim)" }}>
            Sign in or create an account, then this invite will connect you to the shared catalog.
          </p>
          <div className="flex gap-2 justify-center">
            <Link href="/signin" className="px-6 py-3 rounded-full font-eyebrow text-xs" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>Sign in</Link>
            <Link href="/signup" className="px-6 py-3 rounded-full font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>Create account</Link>
          </div>
          <p className="text-xs mt-4" style={{ color: "var(--wd-text-faint)" }}>Invite code: <span style={{ color: "var(--wd-gold)" }}>{code}</span></p>
        </>
      )}
      {status === "error" && (
        <>
          <p className="text-sm mb-4" style={{ color: "#f0a89f" }}>{error}</p>
          <Link href="/records" className="font-eyebrow text-xs" style={{ color: "var(--wd-gold)" }}>Go to your crate</Link>
        </>
      )}
    </div>
  );
}

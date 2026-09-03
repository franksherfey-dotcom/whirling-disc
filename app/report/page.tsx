"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Record } from "../components/Record";
import { ReportDoc, reportToCsv, type Report } from "./ReportDoc";

const usd = (c?: number | null) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString()}`);

export default function ReportPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [purpose, setPurpose] = useState<"insurance" | "estate">("insurance");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
    setReports((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ purpose, owner_name: ownerName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not generate the schedule.");
      setSelected(json.report);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = (r: Report) => {
    const blob = new Blob([reportToCsv(r)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.doc_number}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // When viewing a document, show only the document (so Print captures just it).
  if (selected) {
    return (
      <div>
        <div className="no-print flex items-center justify-between mb-4">
          <button onClick={() => setSelected(null)} className="font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)" }}>
            ← Back
          </button>
          <div className="flex gap-2">
            <button onClick={() => downloadCsv(selected)} className="font-eyebrow text-xs px-4 py-2 rounded-full" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
              Download CSV
            </button>
            <button onClick={() => window.print()} className="font-eyebrow text-xs px-4 py-2 rounded-full" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
              Print / Save PDF
            </button>
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden">
          <ReportDoc report={selected} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Protect</p>
        <h1 className="font-display text-4xl mb-2" style={{ color: "var(--wd-text)" }}>
          Insurance &amp; estate schedule
        </h1>
        <p className="text-sm" style={{ color: "var(--wd-text-dim)" }}>
          A dated, itemized schedule with a per-item condition-adjusted value and a collection
          total — the document an insurer or executor actually asks for. Each schedule is frozen
          when you generate it and gets its own permanent number.
        </p>
      </div>

      <div className="rounded-2xl p-6 space-y-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <div>
          <label className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Owner name</label>
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Name as it should appear on the schedule"
            className="wd-input w-full mt-2 px-5 py-3 rounded-xl text-sm"
            style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
          />
        </div>
        <div>
          <label className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Purpose</label>
          <div className="flex gap-2 mt-2">
            {(["insurance", "estate"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPurpose(p)}
                className="px-4 py-2 rounded-full font-eyebrow text-xs capitalize"
                style={
                  purpose === p
                    ? { background: "var(--wd-gold)", color: "#0d0d0d" }
                    : { color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }
                }
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={busy}
          className="w-full py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}
        >
          {busy ? <Record size={20} spinning /> : "Generate schedule"}
        </button>
      </div>

      {/* Previously issued */}
      <div>
        <p className="font-eyebrow text-xs mb-3" style={{ color: "var(--wd-text-faint)" }}>Issued documents</p>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--wd-text-faint)" }}>Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--wd-text-faint)" }}>None yet. Generate your first schedule above.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.doc_number}
                onClick={() => setSelected(r)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl text-left"
                style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}
              >
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--wd-text)" }}>{r.doc_number}</div>
                  <div className="text-xs" style={{ color: "var(--wd-text-faint)" }}>
                    {new Date(r.created_at).toLocaleDateString()} · {r.item_count} items · {r.purpose}
                  </div>
                </div>
                <div className="text-sm font-semibold" style={{ color: "var(--wd-gold)" }}>
                  {usd(r.total_low_cents)} – {usd(r.total_high_cents)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

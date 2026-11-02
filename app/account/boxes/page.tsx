"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Record as VinylRecord } from "@/lib/types";
import { RecordLoader, Record } from "../../components/Record";
import {
  loadMyCollections,
  labelFor,
  getActiveCollectionId,
  setActiveCollectionId,
  resolveActive,
  canEdit,
  type MyCollection,
} from "@/lib/activeCollection";

const NONE = "__none__";

export default function BoxesPage() {
  const [collections, setCollections] = useState<MyCollection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => collections.find((c) => c.id === activeId) || null, [collections, activeId]);
  const [records, setRecords] = useState<VinylRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const editable = canEdit(active);

  useEffect(() => {
    (async () => {
      const cols = await loadMyCollections();
      setCollections(cols);
      const chosen = resolveActive(cols, getActiveCollectionId());
      if (chosen) {
        setActiveId(chosen.id);
        setActiveCollectionId(chosen.id);
      } else {
        setLoading(false);
      }
    })();
  }, []);

  const reload = async (id: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("records")
      .select("id,artist,title,location,cover_url")
      .eq("collection_id", id)
      .order("artist", { ascending: true });
    setRecords((data as VinylRecord[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (activeId) reload(activeId);
  }, [activeId]);

  const switchTo = (id: string) => {
    if (id === activeId) return;
    setActiveCollectionId(id);
    setActiveId(id);
    setMsg(null);
    setRenaming(null);
  };

  // Group records by box; the "unboxed" bucket sorts last.
  const groups = useMemo(() => {
    const map = new Map<string, VinylRecord[]>();
    records.forEach((r) => {
      const b = (r.location || "").trim() || NONE;
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) =>
      a[0] === NONE ? 1 : b[0] === NONE ? -1 : a[0].localeCompare(b[0], undefined, { numeric: true })
    );
  }, [records]);

  const boxNames = useMemo(() => groups.map(([n]) => n).filter((n) => n !== NONE), [groups]);

  const renameBox = async (oldName: string) => {
    const nn = renameVal.trim();
    if (!activeId || !nn || nn === oldName) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("records").update({ location: nn }).eq("collection_id", activeId).eq("location", oldName);
    setBusy(false);
    setRenaming(null);
    if (error) {
      setMsg("Could not rename box: " + error.message);
      return;
    }
    setMsg(`Renamed “${oldName}” to “${nn}.”`);
    reload(activeId);
  };

  const moveRecord = async (rec: VinylRecord, target: string) => {
    if (!activeId) return;
    let loc: string | null;
    if (target === NONE) {
      loc = null;
    } else if (target === "__new__") {
      const name = typeof window !== "undefined" ? window.prompt("New box name") : null;
      if (!name || !name.trim()) return;
      loc = name.trim();
    } else {
      loc = target;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("records").update({ location: loc }).eq("id", rec.id);
    setBusy(false);
    if (error) {
      setMsg("Could not move record: " + error.message);
      return;
    }
    reload(activeId);
  };

  if (loading) {
    return (
      <div className="py-28">
        <RecordLoader size={72} label="Opening the boxes" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl" style={{ color: "var(--wd-text)" }}>Boxes</h1>
        <Link href="/records" className="font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)" }}>← Crate</Link>
      </div>
      <p className="text-sm" style={{ color: "var(--wd-text-dim)" }}>
        Label which physical box each record lives in, then find anything by box on the crate page.
      </p>

      {/* Crate switcher — manage boxes in your crate or a shared one */}
      {collections.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {collections.map((c) => {
            const on = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => switchTo(c.id)}
                className="px-4 py-2 rounded-full font-eyebrow text-xs transition-colors"
                style={on
                  ? { background: "var(--wd-gold)", color: "#0d0d0d", border: "1px solid var(--wd-gold)" }
                  : { background: "var(--wd-surface)", color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}
              >
                {labelFor(c)}
              </button>
            );
          })}
        </div>
      )}

      {msg && (
        <div className="rounded-xl px-4 py-2 text-xs" style={{ background: "rgba(201,162,39,0.10)", color: "var(--wd-gold-bright)", border: "1px solid rgba(201,162,39,0.30)" }}>{msg}</div>
      )}

      {!editable && (
        <div className="rounded-xl px-4 py-2 text-xs" style={{ background: "var(--wd-surface)", color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
          View only — you can&rsquo;t change boxes in this crate.
        </div>
      )}

      {groups.length === 0 && (
        <div className="rounded-3xl p-14 text-center flex flex-col items-center" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <Record size={56} />
          <p className="mt-6" style={{ color: "var(--wd-text-dim)" }}>No records in this crate yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {groups.map(([name, recs]) => {
          const isNone = name === NONE;
          return (
            <div key={name} className="rounded-2xl overflow-hidden" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
              <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--wd-border)" }}>
                {renaming === name && !isNone ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") renameBox(name); if (e.key === "Escape") setRenaming(null); }}
                      className="wd-input px-3 py-1.5 rounded-lg text-sm flex-1"
                      style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
                    />
                    <button onClick={() => renameBox(name)} disabled={busy} className="font-eyebrow text-xs px-3 py-1.5 rounded-full" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>Save</button>
                    <button onClick={() => setRenaming(null)} className="font-eyebrow text-xs px-2" style={{ color: "var(--wd-text-dim)" }}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold flex items-center gap-2" style={{ color: isNone ? "var(--wd-text-dim)" : "var(--wd-text)" }}>
                      {isNone ? "Unboxed" : `📦 ${name}`}
                      <span className="font-eyebrow text-[11px]" style={{ color: "var(--wd-text-faint)" }}>{recs.length}</span>
                    </p>
                    {!isNone && editable && (
                      <button onClick={() => { setRenaming(name); setRenameVal(name); }} className="font-eyebrow text-xs" style={{ color: "var(--wd-gold)" }}>Rename</button>
                    )}
                  </>
                )}
              </div>
              <div>
                {recs.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-2.5" style={{ borderTop: "1px solid var(--wd-border)" }}>
                    <div className="w-9 h-9 rounded overflow-hidden flex-shrink-0" style={{ background: "var(--wd-surface-2)" }}>
                      {r.cover_url ? <img src={r.cover_url} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--wd-text)" }}>{r.title}</p>
                      <p className="text-xs truncate" style={{ color: "var(--wd-text-dim)" }}>{r.artist}</p>
                    </div>
                    {editable && (
                      <select
                        aria-label="Move to box"
                        value={isNone ? NONE : name}
                        onChange={(e) => moveRecord(r, e.target.value)}
                        disabled={busy}
                        className="wd-input px-3 py-1.5 rounded-full text-xs font-eyebrow cursor-pointer flex-shrink-0"
                        style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text-dim)" }}
                      >
                        {boxNames.map((b) => <option key={b} value={b}>{b}</option>)}
                        <option value={NONE}>Unboxed</option>
                        <option value="__new__">＋ New box…</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

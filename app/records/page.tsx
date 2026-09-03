"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Record as VinylRecord } from "@/lib/types";
import { toUiGrade, GRADE_LABELS, GRADE_DEFINITIONS, type UiGrade } from "@/lib/conditions";
import { SOURCE_LABEL } from "@/lib/pricing/blend";
import { RecordLoader, Record } from "../components/Record";
import Link from "next/link";

const usd = (c?: number | null) => (c == null ? null : `$${Math.round(c / 100).toLocaleString()}`);

const GRADE_RANK: UiGrade[] = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];
type SortKey = "newest" | "artist" | "value_desc" | "year_desc" | "year_asc";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "artist", label: "Artist A→Z" },
  { key: "value_desc", label: "Value high→low" },
  { key: "year_desc", label: "Year new→old" },
  { key: "year_asc", label: "Year old→new" },
];

const decadeOf = (y?: number | null) => (y == null ? null : `${Math.floor(y / 10) * 10}s`);

export default function RecordsPage() {
  const [records, setRecords] = useState<VinylRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [decade, setDecade] = useState("all");
  const [grade, setGrade] = useState("all");
  const [firstPressOnly, setFirstPressOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("records").select("*").order("created_at", { ascending: false });
        setRecords(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Build filter options from the actual catalog so nothing is empty.
  const genreOptions = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => (r.genres || []).forEach((g) => g && s.add(g)));
    return Array.from(s).sort();
  }, [records]);

  const decadeOptions = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => {
      const d = decadeOf(r.year);
      if (d) s.add(d);
    });
    return Array.from(s).sort();
  }, [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = records.filter((r) => {
      if (q && ![r.artist, r.title, r.label, r.catalog_number, r.location].filter(Boolean).some((v) => (v as string).toLowerCase().includes(q))) return false;
      if (genre !== "all" && !(r.genres || []).includes(genre)) return false;
      if (decade !== "all" && decadeOf(r.year) !== decade) return false;
      if (grade !== "all" && (r.media_condition ? toUiGrade(r.media_condition) : null) !== grade) return false;
      if (firstPressOnly && r.pressing_details?.is_first_pressing !== true) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      switch (sort) {
        case "artist":
          return (a.artist || "").localeCompare(b.artist || "");
        case "value_desc":
          return (b.value_high_cents ?? 0) - (a.value_high_cents ?? 0);
        case "year_desc":
          return (b.year ?? 0) - (a.year ?? 0);
        case "year_asc":
          return (a.year ?? 0) - (b.year ?? 0);
        default:
          return (b.created_at || "").localeCompare(a.created_at || "");
      }
    });
    return out;
  }, [records, query, genre, decade, grade, firstPressOnly, sort]);

  const totals = useMemo(() => {
    const low = records.reduce((s, r) => s + (r.value_low_cents ?? 0), 0);
    const high = records.reduce((s, r) => s + (r.value_high_cents ?? 0), 0);
    return { low, high, mid: Math.round((low + high) / 2) };
  }, [records]);

  if (isLoading) {
    return (
      <div className="py-28">
        <RecordLoader size={72} label="Spinning up your crate" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-4 py-2 rounded-full font-eyebrow text-xs flex items-center gap-2" style={{ background: "rgba(201,162,39,0.12)", color: "var(--wd-gold-bright)", border: "1px solid rgba(201,162,39,0.35)" }}>
          All <span style={{ color: "var(--wd-gold)" }}>{records.length}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl p-6" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Inventory</p>
          <p className="text-4xl font-bold" style={{ color: "var(--wd-text)" }}>
            {records.length} <span className="text-base font-normal" style={{ color: "var(--wd-text-dim)" }}>albums</span>
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--wd-text-faint)" }}>{records.length} discs · all valued</p>
          {records.filter((r) => r.pressing_details?.is_first_pressing === true).length > 0 && (
            <p className="text-xs mt-1" style={{ color: "var(--wd-gold)" }}>
              ★ {records.filter((r) => r.pressing_details?.is_first_pressing === true).length} confirmed first pressings
            </p>
          )}
        </div>
        <Link href="/report" className="rounded-2xl p-6 block transition-transform hover:-translate-y-0.5" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Collection value</p>
            <span className="font-eyebrow text-[10px]" style={{ color: "var(--wd-gold)" }}>Insure →</span>
          </div>
          <p className="text-4xl font-bold" style={{ color: "var(--wd-gold)" }}>{usd(totals.mid) ?? "$0"}</p>
          <p className="text-xs mt-2" style={{ color: "var(--wd-text-faint)" }}>
            {usd(totals.low) ?? "$0"} – {usd(totals.high) ?? "$0"} · generate schedule
          </p>
        </Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search artist, title, catalog #, label, location"
        className="wd-input w-full px-5 py-4 rounded-2xl text-sm"
        style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
      />

      {/* Filter + sort row */}
      <div className="flex flex-wrap gap-2">
        <Select value={genre} onChange={setGenre} label="genre">
          <option value="all">All genres</option>
          {genreOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
        <Select value={decade} onChange={setDecade} label="decade">
          <option value="all">All decades</option>
          {decadeOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select value={grade} onChange={setGrade} label="grade">
          <option value="all">Any media grade</option>
          {GRADE_RANK.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
        </Select>
        <Select value={sort} onChange={(v) => setSort(v as SortKey)} label="sort">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </Select>
        {records.some((r) => r.pressing_details?.is_first_pressing === true) && (
          <button
            onClick={() => setFirstPressOnly((v) => !v)}
            className="px-4 py-2 rounded-full font-eyebrow text-xs whitespace-nowrap"
            style={firstPressOnly
              ? { background: "var(--wd-gold)", color: "#0d0d0d", border: "1px solid var(--wd-gold)" }
              : { color: "var(--wd-gold)", border: "1px solid var(--wd-gold)" }}
          >
            ★ First pressings{firstPressOnly ? " ✓" : ""}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>
          Latest digs {filtered.length !== records.length ? `· ${filtered.length} shown` : ""}
        </p>
        <Link href="/records/add" className="font-eyebrow text-xs" style={{ color: "var(--wd-gold)" }}>+ Add Record</Link>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl p-14 text-center flex flex-col items-center" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <Record size={64} />
          <p className="mt-6 mb-6" style={{ color: "var(--wd-text-dim)" }}>
            {records.length === 0 ? "Your crate is empty. Snap photos to add your first record." : "No records match those filters."}
          </p>
          {records.length === 0 && (
            <Link href="/records/add" className="px-6 py-3 rounded-full font-eyebrow text-xs" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>Add Your First Record</Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((r) => {
            const g = r.media_condition ? toUiGrade(r.media_condition) : null;
            return (
              <Link key={r.id} href={`/records/${r.id}`} className="rounded-2xl overflow-hidden transition-transform hover:-translate-y-1 block" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
                <div className="relative aspect-square" style={{ background: "var(--wd-surface-2)" }}>
                  {r.cover_url ? <img src={r.cover_url} alt={r.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Record size={56} /></div>}
                  {g && <span title={GRADE_DEFINITIONS[g]} className="absolute top-2 right-2 px-2.5 py-1 rounded-full font-eyebrow text-[10px] cursor-help" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>{GRADE_LABELS[g]}</span>}
                  {r.pressing_details?.is_first_pressing === true && (
                    <span title="Confirmed first pressing" className="absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-[13px]" style={{ background: "rgba(13,13,13,0.75)", color: "var(--wd-gold)", border: "1px solid var(--wd-gold)" }}>★</span>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-sm truncate" style={{ color: "var(--wd-text)" }}>{r.title}</h3>
                  <p className="text-xs truncate mb-2" style={{ color: "var(--wd-text-dim)" }}>{r.artist}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {r.format && <Tag>{r.format}</Tag>}
                    {r.rpm && <Tag>{r.rpm === "33" ? "33⅓ RPM" : `${r.rpm} RPM`}</Tag>}
                    {r.year && <Tag>{r.year}{decadeOf(r.year) ? ` · ${decadeOf(r.year)}` : ""}</Tag>}
                    {(r.genres || []).slice(0, 1).map((gen) => <Tag key={gen}>{gen}</Tag>)}
                  </div>
                  {(r.value_low_cents != null || r.value_high_cents != null) && (
                    <>
                      <p className="text-sm font-semibold" style={{ color: "var(--wd-gold)" }}>{usd(r.value_low_cents)} – {usd(r.value_high_cents)}</p>
                      {r.value_source && <p className="text-[10px] mt-0.5" style={{ color: "var(--wd-text-faint)" }}>{SOURCE_LABEL[r.value_source as keyof typeof SOURCE_LABEL] ?? r.value_source}</p>}
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="wd-input px-4 py-2.5 rounded-full text-xs font-eyebrow cursor-pointer"
      style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)", color: "var(--wd-text-dim)" }}
    >
      {children}
    </select>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--wd-surface-2)", color: "var(--wd-text-faint)", border: "1px solid var(--wd-border)" }}>{children}</span>;
}

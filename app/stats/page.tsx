"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { Record as VinylRecord } from "@/lib/types";
import { RecordLoader } from "../components/Record";
import Link from "next/link";

const usd = (c?: number | null) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString()}`);
const decadeOf = (y?: number | null) => (y == null ? null : `${Math.floor(y / 10) * 10}s`);

type Tally = { label: string; count: number };
function tally(items: string[]): Tally[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) || 0) + 1);
  return Array.from(m.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// "A, B and C" (caps the list at `max`, then "and N more")
function naturalList(names: string[], max = 6): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= max) return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  return names.slice(0, max).join(", ") + `, and ${names.length - max} more`;
}

// Build a pool of "Did you know" facts from the user's own records.
// Each fact can optionally carry a cover image when it's about a specific record.
type Fact = { text: string; cover?: string | null };
function buildFacts(records: VinylRecord[]): Fact[] {
  if (records.length === 0) return [];
  const facts: Fact[] = [];
  const withYear = records.filter((r) => r.year);
  const genres = tally(records.flatMap((r) => r.genres || []));
  const artists = tally(records.map((r) => r.artist).filter(Boolean));
  const decades = tally(records.map((r) => decadeOf(r.year)).filter(Boolean) as string[]);
  const totalVal = records.reduce((s, r) => s + ((r.value_low_cents || 0) + (r.value_high_cents || 0)) / 2, 0);

  if (withYear.length) {
    const oldest = withYear.reduce((a, b) => (a.year! < b.year! ? a : b));
    facts.push({ text: `Your oldest record is "${oldest.title}" by ${oldest.artist}, from ${oldest.year}.`, cover: oldest.cover_url });
    const newest = withYear.reduce((a, b) => (a.year! > b.year! ? a : b));
    facts.push({ text: `Your newest addition is "${newest.title}" (${newest.year}).`, cover: newest.cover_url });
  }
  if (genres[0]) facts.push({ text: `${genres[0].label} is your most-collected genre — ${genres[0].count} record${genres[0].count > 1 ? "s" : ""} strong.` });
  if (artists[0] && artists[0].count > 1) facts.push({ text: `You've got ${artists[0].count} records by ${artists[0].label} — a clear favorite.` });
  if (decades[0]) facts.push({ text: `The ${decades[0].label} dominate your crate with ${decades[0].count} record${decades[0].count > 1 ? "s" : ""}.` });
  if (records.length >= 3) facts.push({ text: `Your collection spans ${new Set(records.map((r) => decadeOf(r.year)).filter(Boolean)).size} different decades.` });
  if (totalVal > 0) facts.push({ text: `Your crate is worth an estimated ${usd(Math.round(totalVal))} across ${records.length} record${records.length > 1 ? "s" : ""}.` });
  const priciest = records.filter((r) => r.value_high_cents).sort((a, b) => (b.value_high_cents! - a.value_high_cents!))[0];
  if (priciest) facts.push({ text: `Your most valuable piece is "${priciest.title}", valued up to ${usd(priciest.value_high_cents)}.`, cover: priciest.cover_url });
  const countries = tally(records.map((r) => r.country).filter(Boolean) as string[]);
  if (countries.length > 1) {
    facts.push({ text: `Your pressings come from ${countries.length} different countries: ${naturalList(countries.map((c) => c.label))}.` });
  }

  // Genre / decade names spelled out
  if (genres.length >= 2) {
    facts.push({ text: `Your top genres are ${naturalList(genres.slice(0, 3).map((g) => g.label))}.` });
  }
  if (decades.length >= 2) {
    const sortedDec = [...decades].sort((a, b) => a.label.localeCompare(b.label));
    facts.push({ text: `Your records reach across the ${naturalList(sortedDec.map((d) => d.label))}.` });
  }

  // Collection age spread
  if (withYear.length >= 2) {
    const min = Math.min(...withYear.map((r) => r.year!));
    const max = Math.max(...withYear.map((r) => r.year!));
    if (max > min) facts.push({ text: `Your collection spans ${max - min} years, from ${min} to ${max}.` });
  }

  // Value milestones
  if (totalVal > 0 && records.length > 0) {
    const avg = Math.round(totalVal / records.length);
    facts.push({ text: `Your average record is worth about ${usd(avg)}.` });
  }

  // Grade quality breakdown (VG+ or better)
  const graded = records.filter((r) => r.media_condition);
  const goodGrades = new Set(["M", "NM", "VGP"]); // VGP = VG+ in DB
  if (graded.length >= 3) {
    const good = graded.filter((r) => goodGrades.has(r.media_condition as string)).length;
    const pct = Math.round((good / graded.length) * 100);
    facts.push({ text: `${pct}% of your graded records are VG+ or better — a well-kept crate.` });
  }

  // Pressing insights
  const firsts = records.filter((r) => r.pressing_details?.is_first_pressing === true);
  if (firsts.length >= 1) {
    facts.push({ text: `${firsts.length} of your records ${firsts.length === 1 ? "is a confirmed first pressing" : "are confirmed first pressings"} — the most collectible kind.` });
  }
  const needDeadwax = records.filter((r) => r.pressing_details?.uncertainty && !r.deadwax_url);
  if (needDeadwax.length >= 1) {
    facts.push({ text: `${needDeadwax.length} of your records could be worth more — add a deadwax photo to pin down the pressing and tighten the value.` });
  }

  // Label loyalty
  const labels = tally(records.map((r) => r.label).filter(Boolean) as string[]);
  if (labels[0] && labels[0].count > 1) {
    facts.push({ text: `${labels[0].label} is your most-collected label with ${labels[0].count} releases.` });
  }

  // Recently added (this month)
  const now = new Date();
  const thisMonth = records.filter((r) => {
    if (!r.created_at) return false;
    const d = new Date(r.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  if (thisMonth.length >= 1) {
    facts.push({ text: `You've added ${thisMonth.length} record${thisMonth.length > 1 ? "s" : ""} to your crate this month.` });
  }

  return facts;
}

export default function StatsPage() {
  const [records, setRecords] = useState<VinylRecord[] | null>(null);
  const [factIdx, setFactIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("records").select("*").eq("user_id", user.id);
      setRecords(data || []);
    })();
  }, []);

  const facts = useMemo(() => buildFacts(records || []), [records]);

  // Pick a fresh fact each visit (rotates on load).
  useEffect(() => {
    if (facts.length) setFactIdx(Math.floor(Math.random() * facts.length));
  }, [facts]);

  if (records === null) return <div className="py-28"><RecordLoader size={64} label="Crunching your crate" /></div>;

  if (records.length === 0) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="font-display text-3xl mb-3" style={{ color: "var(--wd-text)" }}>No stats yet</h1>
        <p className="text-sm mb-6" style={{ color: "var(--wd-text-dim)" }}>Catalog a few records and your collection stats will show up here.</p>
        <Link href="/records/add" className="inline-block px-6 py-3 rounded-full font-eyebrow text-xs" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>+ Catalog a record</Link>
      </div>
    );
  }

  const genres = tally(records.flatMap((r) => r.genres || [])).slice(0, 6);
  const decades = tally(records.map((r) => decadeOf(r.year)).filter(Boolean) as string[]).sort((a, b) => a.label.localeCompare(b.label));
  const artists = tally(records.map((r) => r.artist).filter(Boolean)).slice(0, 5);
  const totalVal = records.reduce((s, r) => s + ((r.value_low_cents || 0) + (r.value_high_cents || 0)) / 2, 0);
  const maxGenre = Math.max(...genres.map((g) => g.count), 1);
  const maxDecade = Math.max(...decades.map((d) => d.count), 1);

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Your collection</p>
      <h1 className="font-display text-4xl mb-6" style={{ color: "var(--wd-text)" }}>Crate stats</h1>

      {/* Did you know */}
      {facts.length > 0 && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: "linear-gradient(135deg, rgba(201,162,39,0.14), rgba(176,40,28,0.10))", border: "1px solid var(--wd-gold)" }}>
          <p className="font-eyebrow text-xs mb-3" style={{ color: "var(--wd-gold)" }}>Did you know?</p>
          <div className="flex items-center gap-4">
            {facts[factIdx]?.cover && (
              <img src={facts[factIdx].cover!} alt="album cover"
                className="rounded-lg flex-shrink-0 object-cover"
                style={{ width: 84, height: 84, border: "1px solid rgba(201,162,39,0.4)" }} />
            )}
            <p className="text-lg leading-relaxed" style={{ color: "var(--wd-text)" }}>{facts[factIdx]?.text}</p>
          </div>
          {facts.length > 1 && (
            <button onClick={() => setFactIdx((i) => (i + 1) % facts.length)} className="font-eyebrow text-[11px] mt-4" style={{ color: "var(--wd-text-dim)" }}>
              Another one →
            </button>
          )}
        </div>
      )}

      {/* Headline numbers */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat big={String(records.length)} label="Records" />
        <Stat big={String(new Set(records.map((r) => decadeOf(r.year)).filter(Boolean)).size)} label="Decades" />
        <Stat big={usd(Math.round(totalVal))} label="Est. value" />
      </div>

      {/* Genres */}
      {genres.length > 0 && (
        <Section title="Genres">
          {genres.map((g) => (
            <Bar key={g.label} label={g.label} count={g.count} pct={(g.count / maxGenre) * 100} />
          ))}
        </Section>
      )}

      {/* Decades */}
      {decades.length > 0 && (
        <Section title="Eras">
          {decades.map((d) => (
            <Bar key={d.label} label={d.label} count={d.count} pct={(d.count / maxDecade) * 100} />
          ))}
        </Section>
      )}

      {/* Top artists */}
      {artists.length > 0 && (
        <Section title="Most collected artists">
          {artists.map((a, i) => (
            <div key={a.label} className="flex items-center justify-between py-2" style={{ borderBottom: i < artists.length - 1 ? "1px solid var(--wd-border)" : "none" }}>
              <span className="text-sm" style={{ color: "var(--wd-text)" }}>{a.label}</span>
              <span className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>{a.count} record{a.count > 1 ? "s" : ""}</span>
            </div>
          ))}
        </Section>
      )}

      <Link href="/records" className="font-eyebrow text-xs inline-block mt-2" style={{ color: "var(--wd-text-dim)" }}>← Back to crate</Link>
    </div>
  );
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div className="rounded-2xl p-4 text-center" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
      <p className="text-2xl font-bold" style={{ color: "var(--wd-gold)" }}>{big}</p>
      <p className="font-eyebrow text-[10px] mt-1" style={{ color: "var(--wd-text-faint)" }}>{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
      <p className="font-eyebrow text-xs mb-4" style={{ color: "var(--wd-text-faint)" }}>{title}</p>
      {children}
    </div>
  );
}

function Bar({ label, count, pct }: { label: string; count: number; pct: number }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between mb-1">
        <span className="text-sm" style={{ color: "var(--wd-text)" }}>{label}</span>
        <span className="font-eyebrow text-[11px]" style={{ color: "var(--wd-text-faint)" }}>{count}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--wd-surface-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 6)}%`, background: "linear-gradient(90deg, var(--wd-gold), var(--wd-gold-bright))" }} />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Record as VinylRecord } from "@/lib/types";
import { toUiGrade, GRADE_LABELS, GRADE_DEFINITIONS } from "@/lib/conditions";
import { SOURCE_LABEL } from "@/lib/pricing/blend";
import { RecordLoader, Record } from "../../components/Record";
import { CameraCapture } from "../../components/CameraCapture";
import Link from "next/link";

const usd = (c?: number | null) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString()}`);

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [rec, setRec] = useState<VinylRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reappraising, setReappraising] = useState(false);
  const [deadwaxCamera, setDeadwaxCamera] = useState(false);

  const captureDeadwaxAndTighten = async (dataUrl: string) => {
    setDeadwaxCamera(false);
    setReappraising(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/reappraise", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, deadwax: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Re-appraise failed");
      const { data } = await supabase.from("records").select("*").eq("id", id).single();
      setRec(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReappraising(false);
    }
  };

  const reappraise = async () => {
    setReappraising(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/reappraise", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Re-appraise failed");
      // Reload the record to show fresh pressing details + value.
      const { data } = await supabase.from("records").select("*").eq("id", id).single();
      setRec(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReappraising(false);
    }
  };
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("records").select("*").eq("id", id).single();
      setRec(data);
      setLoading(false);
    })();
  }, [id]);

  const doDelete = async () => {
    setDeleting(true);
    setError(null);
    const { error: delErr } = await supabase.from("records").delete().eq("id", id);
    if (delErr) {
      setError(delErr.message);
      setDeleting(false);
      return;
    }
    router.push("/records");
  };

  if (loading) return <div className="py-28"><RecordLoader size={64} label="Loading record" /></div>;
  if (!rec) return (
    <div className="py-28 text-center">
      <p style={{ color: "var(--wd-text-dim)" }}>Record not found.</p>
      <Link href="/records" className="font-eyebrow text-xs mt-4 inline-block" style={{ color: "var(--wd-gold)" }}>← Back to crate</Link>
    </div>
  );

  const discPhotoList = Array.isArray(rec.disc_photo_urls) && rec.disc_photo_urls.length
    ? rec.disc_photo_urls
    : [rec.side_a_url, rec.side_b_url].filter(Boolean) as string[];
  const photos = [
    { url: rec.cover_url, label: "Front cover" },
    { url: rec.back_url, label: "Back cover" },
    ...discPhotoList.map((url, i) => ({
      url,
      label: (rec.disc_count ?? 1) > 1
        ? `Disc ${Math.floor(i / 2) + 1} — Side ${i % 2 === 0 ? "A" : "B"}`
        : `Disc — Side ${i % 2 === 0 ? "A" : "B"}`,
    })),
  ].filter((p) => p.url);

  const mediaGrade = rec.media_condition ? toUiGrade(rec.media_condition) : null;
  const sleeveGrade = rec.sleeve_condition ? toUiGrade(rec.sleeve_condition) : null;

  return (
    <div className="max-w-2xl mx-auto">
      {deadwaxCamera && (
        <CameraCapture
          title="Deadwax / matrix — the etched area near the label"
          guide="square"
          subject="disc"
          autoSnap={false}
          onCapture={captureDeadwaxAndTighten}
          onCancel={() => setDeadwaxCamera(false)}
        />
      )}
      <div className="flex items-center justify-between mb-6">
        <Link href="/records" className="font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)" }}>← Back to crate</Link>
        <div className="flex items-center gap-2">
          <button onClick={reappraise} disabled={reappraising} className="font-eyebrow text-xs px-4 py-2 rounded-full disabled:opacity-60" style={{ border: "1px solid var(--wd-border)", color: "var(--wd-gold)" }}>
            {reappraising ? "Re-appraising…" : "Re-appraise"}
          </button>
          <Link href={`/records/${rec.id}/edit`} className="font-eyebrow text-xs px-4 py-2 rounded-full" style={{ border: "1px solid var(--wd-border)", color: "var(--wd-text-dim)" }}>Edit</Link>
        </div>
      </div>

      <h1 className="font-display text-4xl" style={{ color: "var(--wd-text)" }}>{rec.title}</h1>
      <p className="text-base mb-6" style={{ color: "var(--wd-text-dim)" }}>{rec.artist}</p>

      {(() => {
        const expected = (rec.disc_count ?? 1) * 2;
        const have = discPhotoList.length;
        if (have < expected) {
          return (
            <div className="px-4 py-3 rounded-xl mb-6 text-sm" style={{ background: "rgba(201,162,39,0.12)", border: "1px solid var(--wd-gold)", color: "var(--wd-text)" }}>
              ⚠️ This is marked as a {rec.disc_count}-disc release but only {Math.floor(have / 2)} disc{Math.floor(have / 2) === 1 ? " is" : "s are"} photographed.{" "}
              <Link href={`/records/${rec.id}/edit`} style={{ color: "var(--wd-gold)", textDecoration: "underline" }}>Add the missing disc{expected - have > 1 ? "s" : ""}</Link>.
            </div>
          );
        }
        return null;
      })()}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {photos.map((p) => (
            <div key={p.label} className="rounded-2xl overflow-hidden" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
              <div className="aspect-square" style={{ background: "var(--wd-surface-2)" }}>
                <img src={p.url as string} alt={p.label} className="w-full h-full object-cover" />
              </div>
              <p className="text-[11px] p-2" style={{ color: "var(--wd-text-faint)" }}>{p.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Estimated market value hero — matches the premium detail treatment */}
      <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Estimated market value</p>
        <p className="text-4xl font-bold mb-2" style={{ color: "var(--wd-gold)" }}>
          {usd(rec.value_low_cents)} – {usd(rec.value_high_cents)}
        </p>
        {mediaGrade && (
          <p className="text-xs mb-3" style={{ color: "var(--wd-text-dim)" }}>
            Priced for <span style={{ color: "var(--wd-text)", fontWeight: 600 }}>{GRADE_LABELS[mediaGrade]}</span> condition
            {rec.value_source && <> · <span style={{ color: "var(--wd-text-faint)" }}>{SOURCE_LABEL[rec.value_source as keyof typeof SOURCE_LABEL] ?? rec.value_source}</span></>}
          </p>
        )}
        {typeof rec.ai_confidence === "number" && (
          <span className="inline-block font-eyebrow text-[11px] px-3 py-1.5 rounded-full mb-3" style={{ border: "1px solid var(--wd-gold)", color: "var(--wd-gold)" }}>
            {Math.round(rec.ai_confidence * 100)}% {rec.ai_confidence >= 0.75 ? "High confidence" : rec.ai_confidence >= 0.4 ? "Moderate confidence" : "Low confidence"}
          </span>
        )}
        {rec.summary && <p className="text-sm leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>{rec.summary}</p>}
      </div>

      {/* Pressing details — the identification that drives value */}
      {rec.pressing_details && (rec.pressing_details.identification || rec.pressing_details.matrix_runout || rec.pressing_details.distinguishing_marks) && (
        <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Pressing details</p>
            {rec.pressing_details.is_first_pressing === true && (
              <span className="font-eyebrow text-[10px] px-3 py-1 rounded-full" style={{ background: "rgba(201,162,39,0.15)", color: "var(--wd-gold)", border: "1px solid var(--wd-gold)" }}>First pressing</span>
            )}
            {rec.pressing_details.is_first_pressing === false && (
              <span className="font-eyebrow text-[10px] px-3 py-1 rounded-full" style={{ color: "var(--wd-text-faint)", border: "1px solid var(--wd-border)" }}>Later pressing / reissue</span>
            )}
          </div>
          {rec.pressing_details.identification && (
            <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--wd-text)" }}>{rec.pressing_details.identification}</p>
          )}
          <div className="space-y-2">
            {rec.pressing_details.country_of_pressing && <PressRow label="Pressed in" value={rec.pressing_details.country_of_pressing} />}
            {rec.pressing_details.matrix_runout && <PressRow label="Matrix / runout" value={rec.pressing_details.matrix_runout} mono />}
            {rec.pressing_details.distinguishing_marks && <PressRow label="Identifying marks" value={rec.pressing_details.distinguishing_marks} />}
          </div>
          {rec.pressing_details.uncertainty && (
            <div className="mt-3 px-3 py-2.5 rounded-xl text-xs leading-relaxed" style={{ background: "rgba(201,162,39,0.10)", color: "var(--wd-text-dim)" }}>
              <span style={{ color: "var(--wd-gold)" }}>Why the range is wide: </span>{rec.pressing_details.uncertainty}
            </div>
          )}
          {rec.pressing_details.uncertainty && !rec.deadwax_url && (
            <button onClick={() => setDeadwaxCamera(true)} disabled={reappraising} className="w-full mt-3 py-3 rounded-xl font-eyebrow text-xs flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
              {reappraising ? "Tightening…" : "📷 Add a deadwax photo to tighten this value"}
            </button>
          )}
          {rec.deadwax_url && (
            <p className="text-[11px] mt-3" style={{ color: "var(--wd-text-faint)" }}>✓ Deadwax photo on file — this value reflects the matrix reading.</p>
          )}
        </div>
      )}

      {/* How this value was reached */}
      {rec.reasoning && (rec.reasoning.sleeve || rec.reasoning.condition || rec.reasoning.pressing) && (
        <div className="rounded-2xl p-6 mb-4 space-y-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <p className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>How this value was reached</p>
          {rec.reasoning.sleeve && <ReasonBlock label="Cover / Sleeve" text={rec.reasoning.sleeve} />}
          {rec.reasoning.condition && <ReasonBlock label="Condition" text={rec.reasoning.condition} />}
          {rec.reasoning.pressing && <ReasonBlock label="Label / Pressing" text={rec.reasoning.pressing} />}
        </div>
      )}

      {/* Condition notes */}
      {rec.condition_notes && (
        <div className="rounded-2xl p-6 mb-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Condition notes</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>{rec.condition_notes}</p>
        </div>
      )}

      <div className="rounded-2xl p-5 mb-4 space-y-3" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        {mediaGrade && <Row label="Media"><span title={GRADE_DEFINITIONS[mediaGrade]} style={{ color: "var(--wd-text)" }}>{GRADE_LABELS[mediaGrade]}</span></Row>}
        {sleeveGrade && <Row label="Sleeve"><span style={{ color: "var(--wd-text)" }}>{GRADE_LABELS[sleeveGrade]}</span></Row>}
        {rec.year && <Row label="Year"><span style={{ color: "var(--wd-text)" }}>{rec.year}</span></Row>}
        {rec.label && <Row label="Label"><span style={{ color: "var(--wd-text)" }}>{rec.label}</span></Row>}
        {rec.catalog_number && <Row label="Catalog #"><span style={{ color: "var(--wd-text)" }}>{rec.catalog_number}</span></Row>}
        {rec.format && <Row label="Format"><span style={{ color: "var(--wd-text)" }}>{rec.format}</span></Row>}
        {rec.rpm && <Row label="Speed"><span style={{ color: "var(--wd-text)" }}>{rec.rpm === "33" ? "33⅓ RPM" : `${rec.rpm} RPM`}</span></Row>}
        {rec.location && <Row label="📦 Location"><span style={{ color: "var(--wd-gold)", fontWeight: 600 }}>{rec.location}</span></Row>}
        {rec.discogs_release_url && <Row label="Discogs"><a href={rec.discogs_release_url} target="_blank" rel="noreferrer" style={{ color: "var(--wd-gold)" }}>View release ↗</a></Row>}
      </div>

      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>{error}</div>}

      {/* Delete with confirm step */}
      {!confirmDelete ? (
        <button onClick={() => setConfirmDelete(true)} className="w-full py-3.5 rounded-2xl font-eyebrow text-xs" style={{ color: "#f0a89f", border: "1px solid rgba(176,36,24,0.35)" }}>
          Delete this record
        </button>
      ) : (
        <div className="rounded-2xl p-5" style={{ background: "rgba(176,36,24,0.08)", border: "1px solid rgba(176,36,24,0.35)" }}>
          <p className="text-sm mb-4" style={{ color: "var(--wd-text)" }}>Delete “{rec.title}” for good? This can't be undone.</p>
          <div className="flex gap-2">
            <button onClick={doDelete} disabled={deleting} className="flex-1 py-3 rounded-xl font-eyebrow text-xs disabled:opacity-60" style={{ background: "#b0281c", color: "#fff" }}>
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="px-5 py-3 rounded-xl font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="font-eyebrow text-[11px]" style={{ color: "var(--wd-text-faint)" }}>{label}</span>
      <span className="text-sm text-right">{children}</span>
    </div>
  );
}

function ReasonBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="font-eyebrow text-[11px] mb-1" style={{ color: "var(--wd-gold)" }}>{label}</p>
      <p className="text-sm leading-relaxed" style={{ color: "var(--wd-text-dim)" }}>{text}</p>
    </div>
  );
}

function PressRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="font-eyebrow text-[11px] flex-shrink-0" style={{ color: "var(--wd-text-faint)" }}>{label}</span>
      <span className="text-sm text-right" style={{ color: "var(--wd-text)", fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

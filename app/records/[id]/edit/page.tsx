"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Record as VinylRecord } from "@/lib/types";
import { toDbGrade, toUiGrade, GRADE_LABELS, UiGrade } from "@/lib/conditions";
import { Record } from "../../../components/Record";
import { CameraCapture } from "../../../components/CameraCapture";
import Link from "next/link";

const GRADES: UiGrade[] = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"];

async function uploadPhoto(userId: string, slot: string, dataUrl: string): Promise<string | undefined> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${userId}/${Date.now()}-${slot}.jpg`;
    const { error } = await supabase.storage.from("record-covers").upload(path, blob, { contentType: "image/jpeg" });
    if (error) return undefined;
    return supabase.storage.from("record-covers").getPublicUrl(path).data.publicUrl;
  } catch { return undefined; }
}

export default function EditRecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rec, setRec] = useState<VinylRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [year, setYear] = useState("");
  const [label, setLabel] = useState("");
  const [catalog, setCatalog] = useState("");
  const [rpm, setRpm] = useState("");
  const [country, setCountry] = useState("");
  const [location, setLocation] = useState("");
  const [genres, setGenres] = useState("");
  const [mediaGrade, setMediaGrade] = useState<UiGrade | "">("");
  const [sleeveGrade, setSleeveGrade] = useState<UiGrade | "">("");
  const [discCount, setDiscCount] = useState(1);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [discPhotos, setDiscPhotos] = useState<(string | null)[]>([]);

  const [camera, setCamera] = useState<null | { kind: "front" | "back" | "disc"; idx?: number; title: string; guide: "circle" | "square"; subject: "cover" | "disc" }>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("records").select("*").eq("id", id).single();
      if (data) {
        setRec(data);
        setTitle(data.title || "");
        setArtist(data.artist || "");
        setYear(data.year ? String(data.year) : "");
        setLabel(data.label || "");
        setCatalog(data.catalog_number || "");
        setRpm(data.rpm || "");
        setCountry(data.country || "");
        setLocation(data.location || "");
        setGenres((data.genres || []).join(", "));
        setMediaGrade(data.media_condition ? toUiGrade(data.media_condition) : "");
        setSleeveGrade(data.sleeve_condition ? toUiGrade(data.sleeve_condition) : "");
        const dc = data.disc_count || 1;
        setDiscCount(dc);
        setCoverUrl(data.cover_url || null);
        setBackUrl(data.back_url || null);
        const existing = Array.isArray(data.disc_photo_urls) && data.disc_photo_urls.length
          ? data.disc_photo_urls
          : [data.side_a_url, data.side_b_url].filter(Boolean);
        const slots: (string | null)[] = [];
        for (let i = 0; i < dc * 2; i++) slots[i] = existing[i] || null;
        setDiscPhotos(slots);
      }
      setLoading(false);
    })();
  }, [id]);

  const changeDiscCount = (next: number) => {
    const n = Math.max(1, Math.min(10, next));
    setDiscCount(n);
    setDiscPhotos((prev) => {
      const slots: (string | null)[] = [];
      for (let i = 0; i < n * 2; i++) slots[i] = prev[i] || null;
      return slots;
    });
  };

  const discLabel = (idx: number) => {
    const disc = Math.floor(idx / 2) + 1;
    const side = idx % 2 === 0 ? "A" : "B";
    return discCount > 1 ? `Disc ${disc} — Side ${side}` : `Disc — Side ${side}`;
  };

  const handleCapture = async (dataUrl: string) => {
    if (!camera) return;
    if (camera.kind === "front") setCoverUrl(dataUrl);
    else if (camera.kind === "back") setBackUrl(dataUrl);
    else if (camera.kind === "disc" && camera.idx != null) {
      const idx = camera.idx;
      setDiscPhotos((p) => { const n = [...p]; n[idx] = dataUrl; return n; });
    }
    setCamera(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      // Upload any newly-captured photos (data URLs); keep existing https URLs as-is.
      const up = async (val: string | null, slot: string) =>
        val && val.startsWith("data:") ? (await uploadPhoto(user.id, slot, val)) ?? null : val;

      const newCover = await up(coverUrl, "front");
      const newBack = await up(backUrl, "back");
      const newDiscs: (string | null)[] = [];
      for (let i = 0; i < discPhotos.length; i++) newDiscs[i] = await up(discPhotos[i], `disc-${i}`);
      const discUrls = newDiscs.filter(Boolean) as string[];

      const { error: upErr } = await supabase.from("records").update({
        title: title.trim() || "Untitled",
        artist: artist.trim() || "Unknown artist",
        year: year ? parseInt(year, 10) : null,
        label: label.trim() || null,
        catalog_number: catalog.trim() || null,
        rpm: rpm || null,
        country: country.trim() || null,
        location: location.trim() || null,
        genres: genres.trim() ? genres.split(",").map((g) => g.trim()).filter(Boolean) : null,
        media_condition: mediaGrade ? toDbGrade(mediaGrade) : null,
        sleeve_condition: sleeveGrade ? toDbGrade(sleeveGrade) : null,
        disc_count: discCount,
        cover_url: newCover,
        back_url: newBack,
        side_a_url: discUrls[0] || null,
        side_b_url: discUrls[1] || null,
        disc_photo_urls: discUrls.length ? discUrls : null,
      }).eq("id", id);
      if (upErr) throw new Error(upErr.message);
      router.push(`/records/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (loading) return <div className="py-28 flex justify-center"><Record size={48} spinning /></div>;
  if (!rec) return <div className="py-28 text-center"><p style={{ color: "var(--wd-text-dim)" }}>Record not found.</p></div>;

  const missingDiscs = discPhotos.filter((p) => !p).length;

  return (
    <div className="max-w-2xl mx-auto">
      {camera && (
        <CameraCapture title={camera.title} guide={camera.guide} subject={camera.subject} onCapture={handleCapture} onCancel={() => setCamera(null)} />
      )}

      <Link href={`/records/${id}`} className="font-eyebrow text-xs mb-6 inline-block" style={{ color: "var(--wd-text-dim)" }}>← Cancel</Link>
      <h1 className="font-display text-3xl mb-6" style={{ color: "var(--wd-text)" }}>Edit record</h1>

      {/* Basics */}
      <div className="rounded-2xl p-5 mb-4 space-y-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="wd-edit-input" /></Field>
        <Field label="Artist"><input value={artist} onChange={(e) => setArtist(e.target.value)} className="wd-edit-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year"><input value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))} className="wd-edit-input" inputMode="numeric" /></Field>
          <Field label="Speed (RPM)">
            <select value={rpm} onChange={(e) => setRpm(e.target.value)} className="wd-edit-input">
              <option value="">—</option><option value="33">33⅓</option><option value="45">45</option><option value="78">78</option>
            </select>
          </Field>
        </div>
        <Field label="Label"><input value={label} onChange={(e) => setLabel(e.target.value)} className="wd-edit-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Catalog #"><input value={catalog} onChange={(e) => setCatalog(e.target.value)} className="wd-edit-input" /></Field>
          <Field label="Country"><input value={country} onChange={(e) => setCountry(e.target.value)} className="wd-edit-input" /></Field>
        </div>
        <Field label="Genres (comma-separated)"><input value={genres} onChange={(e) => setGenres(e.target.value)} className="wd-edit-input" /></Field>
        <Field label="Physical location (e.g. Box 1, Shelf B)"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where is this record stored?" className="wd-edit-input" /></Field>
      </div>

      {/* Grades */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <Field label="Media grade">
          <select value={mediaGrade} onChange={(e) => setMediaGrade(e.target.value as UiGrade)} className="wd-edit-input">
            <option value="">—</option>{GRADES.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
          </select>
        </Field>
        <div className="h-3" />
        <Field label="Sleeve grade">
          <select value={sleeveGrade} onChange={(e) => setSleeveGrade(e.target.value as UiGrade)} className="wd-edit-input">
            <option value="">—</option>{GRADES.map((g) => <option key={g} value={g}>{GRADE_LABELS[g]}</option>)}
          </select>
        </Field>
      </div>

      {/* Disc count + photos */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--wd-text)" }}>Discs in this release</p>
            <p className="text-[11px]" style={{ color: "var(--wd-text-faint)" }}>{discCount} disc{discCount > 1 ? "s" : ""} · {discCount * 2} photos</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => changeDiscCount(discCount - 1)} className="w-9 h-9 rounded-full font-bold" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}>−</button>
            <span className="w-6 text-center text-lg font-semibold" style={{ color: "var(--wd-text)" }}>{discCount}</span>
            <button onClick={() => changeDiscCount(discCount + 1)} className="w-9 h-9 rounded-full font-bold" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}>+</button>
          </div>
        </div>

        {missingDiscs > 0 && (
          <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(201,162,39,0.12)", border: "1px solid var(--wd-gold)", color: "var(--wd-text)" }}>
            ⚠️ {missingDiscs} disc photo{missingDiscs > 1 ? "s are" : " is"} missing. Tap the empty slots below to add {missingDiscs > 1 ? "them" : "it"}.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {discPhotos.map((url, i) => (
            <PhotoTile key={i} url={url} title={discLabel(i)} missing={!url}
              onClick={() => setCamera({ kind: "disc", idx: i, title: discLabel(i), guide: "circle", subject: "disc" })} />
          ))}
        </div>
      </div>

      {/* Covers */}
      <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <p className="font-eyebrow text-[11px] mb-3" style={{ color: "var(--wd-text-faint)" }}>Covers</p>
        <div className="grid grid-cols-2 gap-3">
          <PhotoTile url={coverUrl} title="Front cover" onClick={() => setCamera({ kind: "front", title: "Front cover", guide: "square", subject: "cover" })} />
          <PhotoTile url={backUrl} title="Back cover" onClick={() => setCamera({ kind: "back", title: "Back cover", guide: "square", subject: "cover" })} />
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>{error}</div>}

      <button onClick={save} disabled={saving} className="w-full py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center disabled:opacity-60" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
        {saving ? <Record size={20} spinning /> : "Save changes"}
      </button>

      <style jsx>{`
        :global(.wd-edit-input) {
          width: 100%; padding: 0.6rem 0.9rem; border-radius: 0.6rem;
          background: var(--wd-surface-2); border: 1px solid var(--wd-border);
          color: var(--wd-text); font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-eyebrow text-[11px] block mb-1.5" style={{ color: "var(--wd-text-faint)" }}>{label}</span>
      {children}
    </label>
  );
}

function PhotoTile({ url, title, onClick, missing }: { url: string | null; title: string; onClick: () => void; missing?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl overflow-hidden text-left" style={{ background: "var(--wd-surface-2)", border: missing ? "1px dashed var(--wd-gold)" : "1px solid var(--wd-border)" }}>
      <div className="aspect-square flex items-center justify-center">
        {url ? <img src={url} alt={title} className="w-full h-full object-cover" /> : <span className="text-2xl" style={{ color: "var(--wd-gold)" }}>+</span>}
      </div>
      <div className="p-2">
        <p className="text-[11px] font-semibold" style={{ color: "var(--wd-text)" }}>{title}</p>
        <p className="text-[10px]" style={{ color: missing ? "var(--wd-gold)" : "var(--wd-text-faint)" }}>{url ? "Tap to replace" : "Tap to add"}</p>
      </div>
    </button>
  );
}

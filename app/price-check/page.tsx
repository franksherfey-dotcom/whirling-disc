"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toDbGrade, averageGrades } from "@/lib/conditions";
import { SOURCE_LABEL } from "@/lib/pricing/blend";
import { Record } from "../components/Record";
import { CameraCapture } from "../components/CameraCapture";

const usd = (c?: number | null) => (c == null ? "—" : `$${Math.round(c / 100).toLocaleString()}`);

type Slot = "front" | "back";
const SLOTS: { key: Slot; title: string; hint: string }[] = [
  { key: "front", title: "Front cover", hint: "The album art" },
  { key: "back", title: "Back cover", hint: "Tracklist & credits" },
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

async function normalizeImage(file: File, maxEdge = 1600, quality = 0.85): Promise<string> {
  const raw = await fileToDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode failed"));
      i.src = raw;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return raw;
  }
}

async function uploadPhoto(userId: string, slot: string, dataUrl: string): Promise<string | undefined> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${userId}/${Date.now()}-${slot}.jpg`;
    const { error } = await supabase.storage.from("record-covers").upload(path, blob, { contentType: "image/jpeg" });
    if (error) return undefined;
    return supabase.storage.from("record-covers").getPublicUrl(path).data.publicUrl;
  } catch {
    return undefined;
  }
}

type Result = any;

export default function PriceCheckPage() {
  const [photos, setPhotos] = useState<Record<Slot, string>>({} as any);
  const [status, setStatus] = useState<"idle" | "checking" | "saving">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraSlot, setCameraSlot] = useState<null | Slot>(null);
  const router = useRouter();

  const slotMeta: Record<Slot, { title: string; guide: "circle" | "square" }> = {
    front: { title: "Front cover", guide: "square" },
    back: { title: "Back cover", guide: "square" },
  };

  const handleCapture = (dataUrl: string) => {
    if (!cameraSlot) return;
    setResult(null);
    const slot = cameraSlot;
    setPhotos((p) => ({ ...p, [slot]: dataUrl }));
    setCameraSlot(null);
  };

  const canCheck = !!photos.front && status === "idle";

  const check = async () => {
    setStatus("checking");
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: photos.front, back: photos.back }),
      });
      const ai = await res.json();
      if (!res.ok) throw new Error(ai?.error || "Couldn't read that record.");
      setResult(ai);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus("idle");
    }
  };

  const addToCrate = async () => {
    if (!result) return;
    setStatus("saving");
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      const { data: existing } = await supabase
        .from("collections").select("id").eq("owner_id", user.id)
        .order("created_at", { ascending: true }).limit(1);
      let collectionId = existing?.[0]?.id;
      if (!collectionId) {
        const { data: created, error: cErr } = await supabase
          .from("collections").insert([{ owner_id: user.id, name: "My Collection" }])
          .select("id").single();
        if (cErr || !created) throw new Error(cErr?.message || "Could not create collection");
        collectionId = created.id;
      }

      const [coverUrl, backUrl] = await Promise.all([
        photos.front ? uploadPhoto(user.id, "front", photos.front) : Promise.resolve(undefined),
        photos.back ? uploadPhoto(user.id, "back", photos.back) : Promise.resolve(undefined),
      ]);

      const mediaAvg = averageGrades(result.media_condition_a, result.media_condition_b);
      const { error: insErr } = await supabase.from("records").insert([{
        user_id: user.id,
        collection_id: collectionId,
        artist: result.artist || "Unknown artist",
        title: result.title || "Untitled",
        year: result.year ?? null,
        label: result.label ?? null,
        catalog_number: result.catalog_number ?? null,
        format: result.format ?? null,
        rpm: result.rpm ?? null,
        country: result.country ?? null,
        genres: Array.isArray(result.genres) && result.genres.length ? result.genres : null,
        media_condition: toDbGrade(mediaAvg),
        media_condition_a: result.media_condition_a ? toDbGrade(result.media_condition_a) : null,
        media_condition_b: result.media_condition_b ? toDbGrade(result.media_condition_b) : null,
        side_a_label: result.side_a_label ?? null,
        side_b_label: result.side_b_label ?? null,
        sleeve_condition: toDbGrade(result.sleeve_condition),
        value_low_cents: Math.round((result.value_low_usd ?? 0) * 100),
        value_high_cents: Math.round((result.value_high_usd ?? 0) * 100),
        value_source: result.value_source ?? "ai_estimate",
        value_breakdown: result.value_breakdown ?? null,
        discogs_release_url: result.discogs_release_url ?? null,
        ai_confidence: result.confidence ?? null,
        summary: result.summary ?? null,
        condition_notes: result.condition_notes ?? null,
        reasoning: result.reasoning ?? null,
        pressing_details: result.pressing_details ?? null,
        cover_url: coverUrl,
        back_url: backUrl,
      }]);
      if (insErr) throw new Error(insErr.message);
      router.push("/records");
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  };

  if (status === "checking" || status === "saving") {
    return (
      <div className="py-28 flex flex-col items-center">
        <Record size={72} spinning />
        <p className="font-eyebrow text-xs mt-5" style={{ color: "var(--wd-text-faint)" }}>
          {status === "checking" ? "Checking the going rate" : "Adding to your crate"}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {cameraSlot && (
        <CameraCapture
          title={slotMeta[cameraSlot].title}
          guide={slotMeta[cameraSlot].guide}
          subject="cover"
          onCapture={handleCapture}
          onCancel={() => setCameraSlot(null)}
        />
      )}
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Out shopping</p>
      <h1 className="font-display text-4xl mb-2" style={{ color: "var(--wd-text)" }}>Price check</h1>
      <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
        Just snap the front and back covers for a quick value while you're shopping. The disc's actual
        condition inside sets the final price — this assumes it's clean. Nothing is saved unless you add it to your crate.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {SLOTS.map(({ key, title, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => setCameraSlot(key)}
            className="rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}
          >
            <div className="aspect-square flex items-center justify-center" style={{ background: "var(--wd-surface-2)" }}>
              {photos[key] ? <img src={photos[key]} alt={title} className="w-full h-full object-cover" /> : <Record size={40} />}
            </div>
            <div className="p-3">
              <p className="text-xs font-semibold" style={{ color: "var(--wd-text)" }}>{title}</p>
              <p className="text-[11px]" style={{ color: "var(--wd-text-faint)" }}>{photos[key] ? "Tap to retake" : hint}</p>
            </div>
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>
          {error}
        </div>
      )}

      {!result ? (
        <>
          <button type="button" onClick={check} disabled={!canCheck} className="w-full py-4 rounded-2xl font-eyebrow text-sm disabled:opacity-40" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
            Check the price
          </button>
          <p className="text-center text-xs mt-3" style={{ color: "var(--wd-text-faint)" }}>
            Front cover required · back cover optional but improves accuracy
          </p>
        </>
      ) : (
        <div className="rounded-2xl p-6" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
          <h2 className="font-display text-2xl" style={{ color: "var(--wd-text)" }}>{result.title || "Unknown"}</h2>
          <p className="text-sm mb-4" style={{ color: "var(--wd-text-dim)" }}>
            {[result.artist, result.year, result.label, result.rpm ? (result.rpm === "33" ? "33⅓ RPM" : `${result.rpm} RPM`) : null].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="font-eyebrow text-xs" style={{ color: "var(--wd-text-faint)" }}>Estimated value</p>
          <p className="text-4xl font-bold mb-1" style={{ color: "var(--wd-gold)" }}>
            {usd(Math.round((result.value_low_usd ?? 0) * 100))} – {usd(Math.round((result.value_high_usd ?? 0) * 100))}
          </p>
          <p className="text-xs mb-3" style={{ color: "var(--wd-text-faint)" }}>
            {SOURCE_LABEL[result.value_source as keyof typeof SOURCE_LABEL] ?? result.value_source}
          </p>
          <div className="px-3 py-2.5 rounded-xl mb-5 text-xs leading-relaxed" style={{ background: "var(--wd-surface-2)", color: "var(--wd-text-dim)" }}>
            Estimated for a clean, near-mint copy. Check the vinyl before you buy — scratches, warps, or a
            worn sleeve can lower this. Catalog it with disc photos for a condition-accurate value.
          </div>
          <div className="flex gap-2">
            <button onClick={addToCrate} className="flex-1 py-3.5 rounded-2xl font-eyebrow text-xs" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
              I bought it — add to crate
            </button>
            <button onClick={() => { setResult(null); setPhotos({} as any); }} className="px-5 py-3.5 rounded-2xl font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)", border: "1px solid var(--wd-border)" }}>
              Check another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

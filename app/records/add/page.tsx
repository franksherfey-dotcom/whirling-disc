"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toDbGrade, averageGrades } from "@/lib/conditions";
import { Record } from "../../components/Record";
import { CameraCapture } from "../../components/CameraCapture";

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

async function getOrCreateCollectionId(userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("collections").select("id").eq("owner_id", userId)
    .order("created_at", { ascending: true }).limit(1);
  if (existing?.[0]?.id) return existing[0].id;
  const { data: created, error } = await supabase
    .from("collections").insert([{ owner_id: userId, name: "My Collection" }])
    .select("id").single();
  if (error || !created) throw new Error(error?.message || "Could not create collection");
  return created.id;
}

export default function AddRecordPage() {
  const [discCount, setDiscCount] = useState(1);
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  // Disc photos: 2 per disc, indexed [disc0sideA, disc0sideB, disc1sideA, disc1sideB, ...]
  const [discPhotos, setDiscPhotos] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"idle" | "analyzing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const router = useRouter();

  const FREE_LIMIT = 3;

  // On load, check whether a free user has already hit the cap.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles").select("entitlement").eq("id", user.id).maybeSingle();
      if (profile?.entitlement && profile.entitlement !== "free") return; // pro = unlimited
      const { count } = await supabase
        .from("records").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if ((count ?? 0) >= FREE_LIMIT) setLimitReached(true);
    })();
  }, []);

  const totalDiscSlots = discCount * 2;

  // Which slot the live camera is capturing for: 'front', 'back', or a disc index.
  const [cameraTarget, setCameraTarget] = useState<null | { kind: "front" | "back" | "disc"; idx?: number; title: string; guide: "circle" | "square" }>(null);

  const handleCapture = (dataUrl: string) => {
    if (!cameraTarget) return;
    if (cameraTarget.kind === "front") setFront(dataUrl);
    else if (cameraTarget.kind === "back") setBack(dataUrl);
    else if (cameraTarget.kind === "disc" && cameraTarget.idx != null) {
      const idx = cameraTarget.idx;
      setDiscPhotos((p) => ({ ...p, [idx]: dataUrl }));
    }
    setCameraTarget(null);
  };

  // When disc count shrinks, drop now-invalid disc photos.
  const changeDiscCount = (next: number) => {
    const n = Math.max(1, Math.min(10, next));
    setDiscCount(n);
    setDiscPhotos((p) => {
      const kept: Record<number, string> = {};
      for (let i = 0; i < n * 2; i++) if (p[i]) kept[i] = p[i];
      return kept;
    });
  };

  const firstDiscA = discPhotos[0];
  const firstDiscB = discPhotos[1];
  // Need front cover + at least one disc side of the first disc.
  const canAnalyze = !!front && (!!firstDiscA || !!firstDiscB) && status === "idle";

  const discLabel = (idx: number) => {
    const disc = Math.floor(idx / 2) + 1;
    const side = idx % 2 === 0 ? "A" : "B";
    return discCount > 1 ? `Disc ${disc} — Side ${side}` : `Disc — Side ${side}`;
  };

  const analyzeAndSave = async () => {
    setError(null);
    setStatus("analyzing");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("SIGNED_OUT");

      // The AI grades the first disc's two sides (representative of the set).
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back, side_a: firstDiscA, side_b: firstDiscB }),
      });
      const ai = await res.json();
      if (!res.ok) throw new Error(ai?.error || "Could not value this record.");

      setStatus("saving");
      const collectionId = await getOrCreateCollectionId(user.id);

      // Upload covers + every disc photo.
      const [coverUrl, backUrl] = await Promise.all([
        front ? uploadPhoto(user.id, "front", front) : Promise.resolve(undefined),
        back ? uploadPhoto(user.id, "back", back) : Promise.resolve(undefined),
      ]);
      const discUrls: string[] = [];
      for (let i = 0; i < totalDiscSlots; i++) {
        if (discPhotos[i]) {
          const u = await uploadPhoto(user.id, `disc-${i}`, discPhotos[i]);
          if (u) discUrls.push(u);
        }
      }

      const mediaAvg = averageGrades(ai.media_condition_a, ai.media_condition_b);

      const { error: insErr } = await supabase.from("records").insert([{
        user_id: user.id,
        collection_id: collectionId,
        artist: ai.artist || "Unknown artist",
        title: ai.title || "Untitled",
        year: ai.year ?? null,
        label: ai.label ?? null,
        catalog_number: ai.catalog_number ?? null,
        format: ai.format ?? null,
        rpm: ai.rpm ?? null,
        country: ai.country ?? null,
        genres: Array.isArray(ai.genres) && ai.genres.length ? ai.genres : null,
        media_condition: toDbGrade(mediaAvg),
        media_condition_a: ai.media_condition_a ? toDbGrade(ai.media_condition_a) : null,
        media_condition_b: ai.media_condition_b ? toDbGrade(ai.media_condition_b) : null,
        side_a_label: ai.side_a_label ?? null,
        side_b_label: ai.side_b_label ?? null,
        disc_count: discCount,
        sleeve_condition: toDbGrade(ai.sleeve_condition),
        value_low_cents: Math.round((ai.value_low_usd ?? 0) * 100),
        value_high_cents: Math.round((ai.value_high_usd ?? 0) * 100),
        value_source: ai.value_source ?? "ai_estimate",
        value_breakdown: ai.value_breakdown ?? null,
        discogs_release_url: ai.discogs_release_url ?? null,
        ai_confidence: ai.confidence ?? null,
        summary: ai.summary ?? null,
        condition_notes: ai.condition_notes ?? null,
        reasoning: ai.reasoning ?? null,
        pressing_details: ai.pressing_details ?? null,
        cover_url: coverUrl,
        back_url: backUrl,
        side_a_url: discUrls[0],
        side_b_url: discUrls[1],
        disc_photo_urls: discUrls.length ? discUrls : null,
      }]);
      if (insErr) {
        if (insErr.message.includes("FREE_LIMIT_REACHED")) {
          setLimitReached(true);
          setStatus("idle");
          return;
        }
        throw new Error(insErr.message);
      }

      router.push("/records");
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  };

  if (status === "analyzing" || status === "saving") {
    return (
      <div className="py-28 flex flex-col items-center">
        <Record size={72} spinning />
        <p className="font-eyebrow text-xs mt-5" style={{ color: "var(--wd-text-faint)" }}>
          {status === "analyzing" ? "Reading the grooves" : "Filing it in your crate"}
        </p>
      </div>
    );
  }

  const PhotoTile = ({ url, title, hint, onClick }: any) => (
    <button type="button" onClick={onClick} className="rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
      <div className="aspect-square flex items-center justify-center" style={{ background: "var(--wd-surface-2)" }}>
        {url ? <img src={url} alt={title} className="w-full h-full object-cover" /> : <Record size={40} />}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold" style={{ color: "var(--wd-text)" }}>{title}</p>
        <p className="text-[11px]" style={{ color: "var(--wd-text-faint)" }}>{url ? "Tap to retake" : hint}</p>
      </div>
    </button>
  );

  if (limitReached) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="flex justify-center mb-6"><Record size={56} /></div>
        <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-gold)" }}>Free crate full</p>
        <h1 className="font-display text-3xl mb-3" style={{ color: "var(--wd-text)" }}>You've cataloged your 3 free records</h1>
        <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
          The free crate holds 3 records — enough to see how it works. Upgrade for unlimited cataloging,
          full value history, and the insurance &amp; estate schedule.
        </p>
        <a href="mailto:frank.sherfey@gmail.com?subject=Whirling%20Disc%20-%20Upgrade%20to%20unlimited" className="inline-block px-8 py-3.5 rounded-2xl font-eyebrow text-sm" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
          Go unlimited
        </a>
        <div className="mt-4">
          <a href="/records" className="font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)" }}>← Back to crate</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {cameraTarget && (
        <CameraCapture
          title={cameraTarget.title}
          guide={cameraTarget.guide}
          subject={cameraTarget.kind === "disc" ? "disc" : "cover"}
          onCapture={handleCapture}
          onCancel={() => setCameraTarget(null)}
        />
      )}
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-text-faint)" }}>Catalog a record</p>
      <h1 className="font-display text-4xl mb-2" style={{ color: "var(--wd-text)" }}>Photograph it</h1>
      <p className="text-sm mb-6" style={{ color: "var(--wd-text-dim)" }}>
        Set how many discs are in the release, then photograph both sides of each one, plus the covers.
        We grade for condition, identify the pressing, and value it — no typing.
      </p>

      {/* Disc count first — it controls how many disc slots appear */}
      <div className="flex items-center justify-between rounded-2xl px-5 py-4 mb-6" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--wd-text)" }}>How many discs?</p>
          <p className="text-[11px]" style={{ color: "var(--wd-text-faint)" }}>
            {discCount === 1 ? "Single LP — 2 disc photos" : `${discCount} discs — ${discCount * 2} disc photos needed`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => changeDiscCount(discCount - 1)} className="w-9 h-9 rounded-full font-bold" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} aria-label="Fewer discs">−</button>
          <span className="w-6 text-center text-lg font-semibold" style={{ color: "var(--wd-text)" }}>{discCount}</span>
          <button type="button" onClick={() => changeDiscCount(discCount + 1)} className="w-9 h-9 rounded-full font-bold" style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }} aria-label="More discs">+</button>
        </div>
      </div>

      {/* Covers */}
      <p className="font-eyebrow text-[11px] mb-3" style={{ color: "var(--wd-text-faint)" }}>Covers</p>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <PhotoTile url={front} title="Front cover" hint="The album art" onClick={() => setCameraTarget({ kind: "front", title: "Front cover", guide: "square" })} />
        <PhotoTile url={back} title="Back cover" hint="Tracklist & credits" onClick={() => setCameraTarget({ kind: "back", title: "Back cover", guide: "square" })} />
      </div>

      {/* Disc photos — 2 per disc, generated from disc count */}
      <p className="font-eyebrow text-[11px] mb-3" style={{ color: "var(--wd-text-faint)" }}>
        {discCount > 1 ? `Discs (${discCount} records, ${totalDiscSlots} photos)` : "Disc"}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: totalDiscSlots }).map((_, i) => (
          <PhotoTile
            key={i}
            url={discPhotos[i]}
            title={discLabel(i)}
            hint="Check for scratches"
            onClick={() => setCameraTarget({ kind: "disc", idx: i, title: discLabel(i), guide: "circle" })}
          />
        ))}
      </div>

      {error === "SIGNED_OUT" ? (
        <div className="px-4 py-4 rounded-xl mb-4 text-sm text-center" style={{ background: "rgba(201,162,39,0.1)", border: "1px solid var(--wd-gold)", color: "var(--wd-text)" }}>
          <p className="mb-3">Your session expired. Sign back in and your photos will still be here.</p>
          <a href="/signin" className="inline-block px-6 py-2.5 rounded-full font-eyebrow text-xs" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>Sign in</a>
        </div>
      ) : error ? (
        <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ background: "rgba(176,36,24,0.12)", border: "1px solid rgba(176,36,24,0.35)", color: "#f0a89f" }}>
          {error}
        </div>
      ) : null}

      <button type="button" onClick={analyzeAndSave} disabled={!canAnalyze} className="w-full py-4 rounded-2xl font-eyebrow text-sm disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
        Value it &amp; add to crate
      </button>
      <p className="text-center text-xs mt-3" style={{ color: "var(--wd-text-faint)" }}>
        Front cover and at least one disc side required · back cover optional
        {discCount > 1 ? ` · photograph all ${discCount} discs for your records` : ""}
      </p>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { toDbGrade, averageGrades } from "@/lib/conditions";
import { Record } from "../../components/Record";
import { CameraCapture } from "../../components/CameraCapture";
import { DeadwaxCapture } from "../../components/DeadwaxCapture";
import { isIOSApp } from "@/lib/native";
import { loadMyCollections, getActiveCollectionId, canEdit, type MyCollection } from "@/lib/activeCollection";

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

// A problem with specific photos, with the photos to retake named in the message.
class PhotoProblem extends Error {}

// A photo held as a JPEG data URL. Anything else will fail to encode or upload.
const isJpegDataUrl = (s?: string | null) => !!s && /^data:image\/[a-z]+;base64,[A-Za-z0-9+/=\s]+$/.test(s);

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

// Save into whichever crate the user last selected on the crate page, as long
// as they can still edit it; otherwise fall back to their own collection.
async function resolveTargetCollectionId(userId: string): Promise<string> {
  const storedId = getActiveCollectionId();
  if (storedId) {
    const cols = await loadMyCollections();
    const match = cols.find((c) => c.id === storedId) || null;
    if (match && canEdit(match)) return match.id;
  }
  return getOrCreateCollectionId(userId);
}

export default function AddRecordPage() {
  const [discCount, setDiscCount] = useState(1);
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  // Optional close-up of the runout etching. Lets the AI commit to one pressing
  // up front instead of flagging uncertainty and asking for it later.
  const [deadwax, setDeadwax] = useState<string | null>(null);
  // Sealed copies are still shrink-wrapped: value from the jacket, no disc photos.
  const [sealed, setSealed] = useState(false);
  // Disc photos: 2 per disc, indexed [disc0sideA, disc0sideB, disc1sideA, disc1sideB, ...]
  const [discPhotos, setDiscPhotos] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<"idle" | "analyzing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [targetCrate, setTargetCrate] = useState<MyCollection | null>(null);
  const [box, setBox] = useState("");
  const [boxOptions, setBoxOptions] = useState<string[]>([]);

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

  // Figure out which crate this record will save to, for the header note.
  useEffect(() => {
    (async () => {
      const storedId = getActiveCollectionId();
      if (!storedId) return;
      const cols = await loadMyCollections();
      const match = cols.find((c) => c.id === storedId) || null;
      if (match && canEdit(match)) {
        setTargetCrate(match);
        // Offer the boxes already in use in this crate for quick reuse.
        const { data } = await supabase
          .from("records").select("location").eq("collection_id", match.id).not("location", "is", null);
        const boxes = Array.from(new Set((data || []).map((r) => (r.location || "").trim()).filter(Boolean))).sort();
        setBoxOptions(boxes);
        // Keep adding to the box you were using last time, until you start a new one.
        const saved = localStorage.getItem(`wd-current-box:${match.id}`);
        if (saved) setBox(saved);
      }
    })();
  }, []);

  // The box a new record goes into. Remembered per crate on this device.
  const rememberBox = (name: string) => {
    setBox(name);
    if (targetCrate) localStorage.setItem(`wd-current-box:${targetCrate.id}`, name);
  };
  const startNewBox = () => {
    // Next number after the highest "Box N" already in this crate.
    const nums = boxOptions.map((b) => { const m = b.match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; });
    const next = Math.max(0, ...nums) + 1;
    const name = `Box ${next}`;
    setBoxOptions((prev) => Array.from(new Set([...prev, name])).sort());
    rememberBox(name);
  };

  const totalDiscSlots = discCount * 2;

  // Which slot the live camera is capturing for: 'front', 'back', or a disc index.
  const [cameraTarget, setCameraTarget] = useState<null | { kind: "front" | "back" | "disc" | "deadwax"; idx?: number; title: string; guide: "circle" | "square" | "band" }>(null);

  // Quick check: after the front cover, ask whether the runout photo is worth taking.
  const [quickCheck, setQuickCheck] = useState<null | { recommended: boolean; reason: string }>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const runQuickCheck = async (frontUrl: string) => {
    setQuickCheck(null);
    setQuickBusy(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quick: true, front: frontUrl }),
      });
      const data = await res.json();
      const pd = data?.pressing_details;
      if (res.ok && pd && typeof pd.deadwax_recommended === "boolean") {
        setQuickCheck({ recommended: pd.deadwax_recommended, reason: pd.deadwax_reason ?? "" });
      }
    } catch {
      /* the quick check is optional; the full analysis still runs on save */
    } finally {
      setQuickBusy(false);
    }
  };

  const handleCapture = (dataUrl: string) => {
    if (!cameraTarget) return;
    if (cameraTarget.kind === "front") { setFront(dataUrl); runQuickCheck(dataUrl); }
    else if (cameraTarget.kind === "back") setBack(dataUrl);
    else if (cameraTarget.kind === "deadwax") setDeadwax(dataUrl);
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
  const canAnalyze = !!front && (sealed || !!firstDiscA || !!firstDiscB) && status === "idle";

  const discLabel = (idx: number) => {
    const disc = Math.floor(idx / 2) + 1;
    const side = idx % 2 === 0 ? "A" : "B";
    return discCount > 1 ? `Disc ${disc} — Side ${side}` : `Disc — Side ${side}`;
  };

  // Turn raw browser/SDK errors into something a person can act on. The
  // underlying message (e.g. "The string did not match the expected pattern")
  // is a low-level failure, almost always a photo that didn't encode cleanly;
  // we keep it in the console for debugging and show guidance instead.
  const friendlyError = (e: unknown): string => {
    if (e instanceof PhotoProblem) return e.message;
    const raw = (e as Error)?.message || String(e);
    const low = raw.toLowerCase();
    if (raw === "SIGNED_OUT" || low.includes("jwt") || low.includes("not signed in") || low.includes("auth"))
      return "You've been signed out. Please sign in again, then re-add this record.";
    if (low.includes("did not match the expected pattern") || low.includes("data url") || low.includes("base64") || low.includes("blob"))
      return "One of the photos didn't save correctly — usually a dark or blurry shot. Tap any photo above to retake it, then tap Value it & add again.";
    if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("load failed") || low.includes("timeout") || low.includes("reach"))
      return "Couldn't reach the valuation service. Check your internet connection and try again — your photos are still here.";
    if (low.includes("could not value") || low.includes("could not read") || low.includes("malformed"))
      return "We couldn't read the record from these photos. Retake the front cover and the Side A label so the text is sharp and well-lit, then try again.";
    if (low.includes("free_limit")) return "You've reached the free limit. Upgrade to add more records.";
    if (low.includes("storage") || low.includes("upload"))
      return "A photo didn't upload. Check your connection and try again; if it keeps happening, retake that photo.";
    // Unknown: give a human sentence but keep a short technical hint for reports.
    return `Something went wrong saving this record. Try again, and if it keeps happening, retake the photos. (${raw.slice(0, 80)})`;
  };

  const analyzeAndSave = async () => {
    setError(null);
    setStatus("analyzing");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("SIGNED_OUT");

      // Name any photo that can't be read before sending anything, so the
      // retake is one photo, not all of them.
      const unreadable = [
        front && !isJpegDataUrl(front) ? "Front cover" : null,
        back && !isJpegDataUrl(back) ? "Back cover" : null,
        deadwax && !isJpegDataUrl(deadwax) ? "Label close-up, Side A" : null,
        ...Object.entries(discPhotos).map(([i, p]) => (p && !isJpegDataUrl(p) ? discLabel(Number(i)) : null)),
      ].filter(Boolean) as string[];
      if (unreadable.length) {
        throw new PhotoProblem(`Retake ${unreadable.join(", ")}. ${unreadable.length > 1 ? "Those photos" : "That photo"} didn't save correctly, usually a dark or blurry shot.`);
      }

      // The AI grades the first disc's two sides (representative of the set).
      // If the runout close-up is what breaks the valuation, value the record
      // without it, so it still catalogs, and flag it for a retake.
      let runoutUnread = false;
      const askAi = (withDeadwax: boolean) => fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          front,
          back,
          sealed,
          side_a: sealed ? undefined : firstDiscA,
          side_b: sealed ? undefined : firstDiscB,
          deadwax: !sealed && withDeadwax ? deadwax || undefined : undefined,
        }),
      });
      let res = await askAi(true);
      let ai = await res.json().catch(() => ({}));
      if (!res.ok && deadwax) {
        runoutUnread = true;
        res = await askAi(false);
        ai = await res.json().catch(() => ({}));
      }
      if (!res.ok) throw new Error(ai?.error || "Could not value this record.");
      if (deadwax && ai.pressing_details?.matrix_legible !== true) runoutUnread = true;

      setStatus("saving");
      const collectionId = await resolveTargetCollectionId(user.id);

      // Upload covers + every disc photo, remembering which ones failed.
      const failed: string[] = [];
      const track = async (label: string, slot: string, data?: string | null) => {
        if (!data) return undefined;
        const url = await uploadPhoto(user.id, slot, data);
        if (!url) failed.push(label);
        return url;
      };
      const [coverUrl, backUrl, deadwaxUrl] = await Promise.all([
        track("Front cover", "front", front),
        track("Back cover", "back", back),
        track("Label close-up, Side A", "deadwax", deadwax),
      ]);
      const discUrls: string[] = [];
      for (let i = 0; i < totalDiscSlots; i++) {
        if (discPhotos[i]) {
          const u = await track(discLabel(i), `disc-${i}`, discPhotos[i]);
          if (u) discUrls.push(u);
        }
      }
      // A runout photo that didn't upload doesn't block the record; it's flagged.
      const deadwaxFailed = failed.indexOf("Label close-up, Side A");
      if (deadwaxFailed >= 0) {
        failed.splice(deadwaxFailed, 1);
        runoutUnread = true;
      }
      if (failed.length) {
        throw new PhotoProblem(`Retake ${failed.join(", ")}. ${failed.length > 1 ? "Those photos" : "That photo"} didn't upload. Check your connection, retake, then tap Value it & add again.`);
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
        // A sealed copy is not inspected, so store "M" rather than a grade from discs we never saw.
        media_condition: toDbGrade(sealed ? "M" : mediaAvg),
        media_condition_a: ai.media_condition_a ? toDbGrade(ai.media_condition_a) : null,
        media_condition_b: ai.media_condition_b ? toDbGrade(ai.media_condition_b) : null,
        side_a_label: ai.side_a_label ?? null,
        side_b_label: ai.side_b_label ?? null,
        disc_count: discCount,
        location: box.trim() || null,
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
        pressing_details: sealed
          ? { ...(ai.pressing_details ?? {}), sealed: true, runout_unread: false }
          : ai.pressing_details
            ? { ...ai.pressing_details, runout_unread: runoutUnread }
            : (runoutUnread ? { runout_unread: true } : null),
        cover_url: coverUrl,
        back_url: backUrl,
        side_a_url: discUrls[0],
        side_b_url: discUrls[1],
        disc_photo_urls: discUrls.length ? discUrls : null,
        deadwax_url: deadwaxUrl ?? null,
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
      console.error("add record failed:", e);
      setError(friendlyError(e));
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
        {isIOSApp() ? (
          // No purchase or upgrade UI in the iOS build until in-app purchase ships.
          <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
            The free crate holds 3 records, enough to see how it works.
          </p>
        ) : (
          <>
            <p className="text-sm mb-8" style={{ color: "var(--wd-text-dim)" }}>
              The free crate holds 3 records — enough to see how it works. Upgrade for unlimited cataloging,
              full value history, and the insurance &amp; estate schedule.
            </p>
            <a href="mailto:frank.sherfey@gmail.com?subject=Whirling%20Disc%20-%20Upgrade%20to%20unlimited" className="inline-block px-8 py-3.5 rounded-2xl font-eyebrow text-sm" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
              Go unlimited
            </a>
          </>
        )}
        <div className="mt-4">
          <a href="/records" className="font-eyebrow text-xs" style={{ color: "var(--wd-text-dim)" }}>← Back to crate</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {cameraTarget && cameraTarget.kind === "deadwax" && (
        <DeadwaxCapture onCapture={handleCapture} onCancel={() => setCameraTarget(null)} />
      )}
      {cameraTarget && cameraTarget.kind !== "deadwax" && (
        <CameraCapture
          title={cameraTarget.title}
          guide={cameraTarget.guide}
          subject={cameraTarget.kind === "disc" ? "disc" : "cover"}
          onCapture={handleCapture}
          onCancel={() => setCameraTarget(null)}
        />
      )}
      <p className="font-eyebrow text-xs mb-2" style={{ color: "var(--wd-gold)" }}>
        {targetCrate && !targetCrate.is_owner
          ? `Add to crate · Saves to ${targetCrate.owner_label}'s collection`
          : "Add to crate · Saves to your collection"}
      </p>
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

      {/* Which physical box this record goes in — labeled as you catalog */}
      <div className="rounded-2xl px-5 py-4 mb-6" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--wd-text)" }}>📦 Box / storage location</p>
        <p className="text-[11px] mb-3" style={{ color: "var(--wd-text-faint)" }}>
          {box.trim() ? <>New records go into <span style={{ color: "var(--wd-gold)" }}>{box.trim()}</span> until you start a new box.</> : "Where this record is stored, e.g. “Box 1” or “Shelf B.” Optional."}
        </p>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={startNewBox} className="px-4 py-2.5 rounded-xl font-eyebrow text-xs flex-shrink-0" style={{ background: "var(--wd-gold)", color: "#0d0d0d" }}>
            + Start new box
          </button>
        </div>
        <input
          value={box}
          onChange={(e) => rememberBox(e.target.value)}
          list="wd-box-options"
          placeholder="Box 1"
          className="wd-input w-full px-4 py-3 rounded-xl text-sm"
          style={{ background: "var(--wd-surface-2)", border: "1px solid var(--wd-border)", color: "var(--wd-text)" }}
        />
        <datalist id="wd-box-options">
          {boxOptions.map((b) => <option key={b} value={b} />)}
        </datalist>
      </div>

      {/* Covers */}
      <p className="font-eyebrow text-[11px] mb-3" style={{ color: "var(--wd-text-faint)" }}>Covers</p>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <PhotoTile url={front} title="Front cover" hint="The album art" onClick={() => setCameraTarget({ kind: "front", title: "Front cover", guide: "square" })} />
        <PhotoTile url={back} title="Back cover" hint="Tracklist & credits" onClick={() => setCameraTarget({ kind: "back", title: "Back cover", guide: "square" })} />
      </div>
      {/* Right under the front cover, so the answer comes before the other photos */}
      {quickBusy && !quickCheck && (
        <p className="text-[11px] mb-3" style={{ color: "var(--wd-text-faint)" }}>Checking whether this one needs a runout shot…</p>
      )}
      {quickCheck && (
        <div className="mb-4 px-3 py-2.5 rounded-xl text-xs leading-relaxed" style={{ background: "var(--wd-surface)", border: "1px solid var(--wd-border)", color: quickCheck.recommended ? "var(--wd-gold)" : "var(--wd-text-dim)" }}>
          {quickCheck.recommended ? "📷 Worth a runout shot: " : "Runout optional: "}
          {quickCheck.reason}
        </div>
      )}

      {/* Sealed toggle: the record is still shrink-wrapped, so there are no discs to photograph */}
      <button
        type="button"
        onClick={() => setSealed((s) => !s)}
        aria-pressed={sealed}
        className="w-full mb-6 px-4 py-3 rounded-2xl text-left text-sm"
        style={{ background: sealed ? "rgba(201,162,39,0.12)" : "var(--wd-surface)", border: `1px solid ${sealed ? "var(--wd-gold)" : "var(--wd-border)"}`, color: "var(--wd-text)" }}
      >
        <span className="font-eyebrow text-[11px] block mb-1" style={{ color: sealed ? "var(--wd-gold)" : "var(--wd-text-faint)" }}>
          {sealed ? "Sealed copy: on" : "Still sealed?"}
        </span>
        {sealed
          ? "Valued from the jacket. Disc and runout photos are skipped, and the value assumes the wrap is intact."
          : "Tap if the shrink wrap is still on. You won't need to open it."}
      </button>

      {!sealed && (<>
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

      {/* Etched numbers — optional, but it is what lets the value commit to one pressing */}
      <p className="font-eyebrow text-[11px] mb-3" style={{ color: "var(--wd-text-faint)" }}>Etched numbers (optional)</p>
      <div className="grid grid-cols-2 gap-4 mb-2">
        <PhotoTile
          url={deadwax}
          title="Label close-up, Side A"
          hint="Uses your phone's camera"
          onClick={() => setCameraTarget({ kind: "deadwax", title: "Label close-up", guide: "circle" })}
        />
        <div className="rounded-2xl p-4 text-xs leading-relaxed" style={{ background: "var(--wd-surface)", border: "1px dashed var(--wd-border)", color: "var(--wd-text-dim)" }}>
          Opens your phone's camera. Get close so the Side A label fills the screen; the tiny codes scratched into the
          ring around it (collectors call it the deadwax) are what separate a first pressing from a reissue. Skip it and
          you can add it later.
        </div>
      </div>
      <div className="mb-6" />
      </>)}

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
        {sealed
          ? "Front cover required · back cover optional"
          : "Front cover and at least one disc side required · back cover optional"}
        {!sealed && discCount > 1 ? ` · photograph all ${discCount} discs for your records` : ""}
      </p>
    </div>
  );
}

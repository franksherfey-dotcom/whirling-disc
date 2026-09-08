"use client";

import { useRef, useState } from "react";
import { Record } from "./Record";

type Props = {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
};

// The etched matrix text is 2-3 mm tall. A web camera preview is only 1080p,
// which leaves each character a dozen pixels high: unreadable. So this shot
// uses the phone's real camera (full-resolution still, its own autofocus and
// tap-to-focus), then we crop to the label and the ring around it and keep as
// many pixels as the upload can carry. The server magnifies the ring from there.
const OUT_PX = 2400;

async function fileToCroppedDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Couldn't read that photo"));
      i.src = url;
    });
    // Browsers apply EXIF orientation when decoding into <img>, so width/height
    // here are already upright.
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const out = Math.min(OUT_PX, side);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function DeadwaxCapture({ onCapture, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await fileToCroppedDataUrl(f));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openCamera = () => inputRef.current?.click();

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000" }}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />

      <div className="flex items-center justify-between px-5 py-4" style={{ color: "#fff" }}>
        <button onClick={onCancel} className="font-eyebrow text-xs" style={{ color: "#bbb" }}>Cancel</button>
        <span className="font-eyebrow text-xs">{preview ? "Can you read it?" : "Label close-up"}</span>
        <span className="font-eyebrow text-xs" style={{ color: "#444" }}>&nbsp;</span>
      </div>

      {preview ? (
        <>
          <div className="relative flex-1 overflow-auto flex items-center justify-center" style={{ WebkitOverflowScrolling: "touch" }}>
            <img src={preview} alt="Your shot" className="w-full h-auto" />
          </div>
          <p className="text-center px-6 pt-4 text-xs leading-relaxed" style={{ background: "#000", color: "#bbb" }}>
            Look at the smooth ring just outside the label. If you can make out scratched-in letters or numbers there
            (pinch to zoom), so can we. Soft, or washed out by glare? Retake it with the light coming from the side.
          </p>
          <div className="flex gap-3 px-5 py-6" style={{ background: "#000" }}>
            <button onClick={() => { setPreview(null); openCamera(); }} className="flex-1 py-4 rounded-2xl font-eyebrow text-sm" style={{ color: "#ddd", border: "1px solid #444" }}>
              Retake
            </button>
            <button onClick={() => onCapture(preview)} className="flex-1 py-4 rounded-2xl font-eyebrow text-sm" style={{ background: "#c9a227", color: "#0d0d0d" }}>
              Use this photo
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto flex flex-col items-center px-6 pt-2 pb-8 text-center" style={{ WebkitOverflowScrolling: "touch" }}>
          <img
            src="/etched-numbers-guide.jpg"
            alt="A record label with the smooth ring around it highlighted: the etched numbers are in that ring"
            className="w-full max-w-sm rounded-2xl mb-5"
            style={{ border: "1px solid #333" }}
          />
          <h2 className="font-display text-2xl mb-3" style={{ color: "#fff" }}>Use your phone's camera</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: "#bbb" }}>
            Frame it like the picture: <span style={{ color: "#c9a227" }}>label in the middle, black vinyl showing all the
            way around it</span>. The scratched-in numbers sit in that smooth ring, so they'll be in the shot on their own.
          </p>
          <p className="text-xs leading-relaxed mb-8" style={{ color: "#888" }}>
            Tap the ring on screen so the camera focuses there. Light from the side (a lamp, or tilt the record toward
            a window) makes the etching pop; straight overhead light makes it vanish. Don't go so close that the ring
            gets cut off.
          </p>
          {error && <p className="text-xs mb-4" style={{ color: "#f0a89f" }}>{error}</p>}
          <button onClick={openCamera} disabled={busy} className="w-full max-w-xs py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "#c9a227", color: "#0d0d0d" }}>
            {busy ? <Record size={20} spinning /> : "📷 Open camera"}
          </button>
        </div>
      )}
    </div>
  );
}

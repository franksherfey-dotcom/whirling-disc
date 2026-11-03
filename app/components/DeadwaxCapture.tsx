"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Record } from "./Record";
import { captureRunoutNative } from "../../lib/torch";

const SKIP_KEY = "wd_deadwax_skip_intro";

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

// Scores how sharp a photo is (variance of the Laplacian on a small grey copy).
// Blurry shots score low, so the sharpest of the three native shots wins.
async function sharpnessScore(blob: Blob): Promise<number> {
  const N = 512;
  const bmp = await createImageBitmap(blob, { resizeWidth: N, resizeHeight: N });
  const c = document.createElement("canvas");
  c.width = N;
  c.height = N;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const d = ctx.getImageData(0, 0, N, N).data;
  const g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - N] - g[i + N];
      sum += l;
      sum2 += l * l;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

// Keeps the sharpest of the native shots and returns it as a File.
async function sharpestFile(shots: string[]): Promise<File> {
  const blobs = shots.map((b64) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/jpeg" }));
  const scores = await Promise.all(blobs.map(sharpnessScore));
  const best = scores.indexOf(Math.max(...scores));
  return new File([blobs[best]], "runout.jpg", { type: "image/jpeg" });
}

export function DeadwaxCapture({ onCapture, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After the first couple of captures the tips are just friction, so let the
  // user dismiss them for good; returning users get a compact one-tap screen.
  const [skipIntro, setSkipIntro] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SKIP_KEY) === "1") setSkipIntro(true);
    } catch {
      /* storage blocked — just show the tips */
    }
  }, []);

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

  const openCamera = async () => {
    if (dontShow) {
      try {
        localStorage.setItem(SKIP_KEY, "1");
      } catch {
        /* ignore */
      }
      setSkipIntro(true);
    }
    // iOS shell: the full-screen capture takes three shots at three light levels.
    if (Capacitor.isNativePlatform()) {
      setBusy(true);
      setError(null);
      const shots = await captureRunoutNative();
      if (shots === null) {
        // Older shell build without the native screen: fall back to the system camera.
        setBusy(false);
        inputRef.current?.click();
        return;
      }
      if (shots.length === 0) {
        setBusy(false); // cancelled
        return;
      }
      try {
        setPreview(await fileToCroppedDataUrl(await sharpestFile(shots)));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    inputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col wd-safe-top wd-safe-bottom-pad" style={{ background: "#000" }}>
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
      ) : skipIntro ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10 text-center">
          {error && <p className="text-xs mb-4" style={{ color: "#f0a89f" }}>{error}</p>}
          <button onClick={openCamera} disabled={busy} className="w-full max-w-xs py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "#c9a227", color: "#0d0d0d" }}>
            {busy ? <Record size={20} spinning /> : "📷 Open camera"}
          </button>
          <button onClick={() => setSkipIntro(false)} className="mt-5 font-eyebrow text-xs" style={{ color: "#777" }}>
            Show tips
          </button>
        </div>
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
          <p className="text-xs leading-relaxed mb-6" style={{ color: "#888" }}>
            Tap the ring on screen so the camera focuses there. Light from the side (a lamp, or tilt the record toward
            a window) makes the etching pop; straight overhead light makes it vanish. Don't go so close that the ring
            gets cut off.
          </p>
          <label className="flex items-center gap-2 mb-6 text-xs cursor-pointer" style={{ color: "#999" }}>
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} style={{ accentColor: "#c9a227", width: 16, height: 16 }} />
            Don&rsquo;t show these tips again
          </label>
          {error && <p className="text-xs mb-4" style={{ color: "#f0a89f" }}>{error}</p>}
          <button onClick={openCamera} disabled={busy} className="w-full max-w-xs py-4 rounded-2xl font-eyebrow text-sm flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "#c9a227", color: "#0d0d0d" }}>
            {busy ? <Record size={20} spinning /> : "📷 Open camera"}
          </button>
        </div>
      )}
    </div>
  );
}

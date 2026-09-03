"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  title: string;               // e.g. "Front cover" or "Disc — Side A"
  guide?: "circle" | "square"; // framing guide shape
  subject?: "cover" | "disc";  // tunes auto-snap: covers (esp. text-heavy backs) are more lenient
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
  autoSnap?: boolean;          // attempt auto-capture when a subject is detected
};

// Downscale a captured frame to keep uploads/AI happy.
function canvasToJpeg(canvas: HTMLCanvasElement, maxEdge = 1600, quality = 0.85): string {
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height));
  if (scale === 1) return canvas.toDataURL("image/jpeg", quality);
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", quality);
}

export function CameraCapture({ title, guide = "square", subject = "cover", onCapture, onCancel, autoSnap = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzeCanvas = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState(autoSnap);
  const [holdPct, setHoldPct] = useState(0); // 0-100 visual countdown for auto-snap
  const capturedRef = useRef(false);
  const stableFramesRef = useRef(0);
  const lastMetricRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || capturedRef.current) return;
    capturedRef.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const jpeg = canvasToJpeg(canvas);
    stop();
    onCapture(jpeg);
  }, [onCapture, stop]);

  // Start the camera.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // Continuous autofocus where supported.
            // @ts-ignore - not in all TS lib versions
            focusMode: "continuous",
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        // Try to force continuous AF on the track if the browser allows it.
        const track = stream.getVideoTracks()[0];
        try {
          // @ts-ignore
          const caps = track.getCapabilities?.() || {};
          // @ts-ignore
          if (caps.focusMode && caps.focusMode.includes("continuous")) {
            // @ts-ignore
            await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
          }
        } catch { /* not supported — the OS still does its own AF */ }
        setReady(true);
      } catch (e) {
        setError("Couldn't access the camera. Check camera permission for this site in your browser settings, then reload.");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [stop]);

  // Auto-snap loop: sample the center region; when it's bright, detailed, and
  // stable for a few frames, capture. This is a heuristic, not true object
  // detection — the manual shutter is always available.
  useEffect(() => {
    if (!ready || !autoOn) { setHoldPct(0); stableFramesRef.current = 0; return; }
    let raf = 0;
    const NEEDED = subject === "cover" ? 16 : 30; // covers snap quicker (~0.6s vs ~1.1s)

    const tick = () => {
      const video = videoRef.current;
      if (!video || capturedRef.current) return;
      if (!analyzeCanvas.current) analyzeCanvas.current = document.createElement("canvas");
      const c = analyzeCanvas.current;
      const S = 64; // small sample of the guide region
      c.width = S; c.height = S;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      // Sample the square region the framing guide covers (~78% of the short side),
      // so we're measuring what's inside the guide, not the whole frame.
      const guideFrac = 0.78;
      const side = Math.min(video.videoWidth, video.videoHeight) * guideFrac;
      const sx = (video.videoWidth - side) / 2;
      const sy = (video.videoHeight - side) / 2;
      ctx.drawImage(video, sx, sy, side, side, 0, 0, S, S);
      const { data } = ctx.getImageData(0, 0, S, S);

      // Two zones: the inner center (should be the record) and the outer ring
      // (should ALSO be the record if it fills the guide). We compute detail in
      // both. A record that fills the frame has real detail out to the edges;
      // a record only half-in-frame leaves the ring flat/background.
      let lum = 0, centerEdge = 0, ringEdge = 0, prev = 0;
      let centerN = 0, ringN = 0;
      const mid = S / 2, innerR = S * 0.28;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const idx = (y * S + x) * 4;
          const l = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          lum += l;
          const d = Math.abs(l - prev); prev = l;
          const dist = Math.hypot(x - mid, y - mid);
          if (dist < innerR) { centerEdge += d; centerN++; }
          else if (dist > S * 0.36) { ringEdge += d; ringN++; }
        }
      }
      const n = S * S;
      lum /= n;
      centerEdge /= Math.max(1, centerN);
      ringEdge /= Math.max(1, ringN);

      // Fill check: the record must reach the edges of the guide, i.e. the ring
      // has to carry real detail too — not just the center. Covers (especially
      // text-on-plain back covers) legitimately have low edge detail, so we
      // relax the ring requirement for them and lean more on center detail.
      const ringMin = subject === "cover" ? 1.4 : 4.5;
      const centerMin = subject === "cover" ? 2.2 : 4.5;
      const fillsFrame = ringEdge > ringMin && centerEdge > centerMin;
      const litEnough = lum > 40;

      // Stability: tighter than before, and tracked on the combined metric.
      const metric = lum + (centerEdge + ringEdge) * 3;
      const stable = lastMetricRef.current != null && Math.abs(metric - lastMetricRef.current) < 4;
      lastMetricRef.current = metric;

      if (fillsFrame && litEnough && stable) stableFramesRef.current += 1;
      else stableFramesRef.current = Math.max(0, stableFramesRef.current - 3);

      setHoldPct(Math.min(100, Math.round((stableFramesRef.current / NEEDED) * 100)));

      if (stableFramesRef.current >= NEEDED) { capture(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, autoOn, capture, subject]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ color: "#fff" }}>
        <button onClick={() => { stop(); onCancel(); }} className="font-eyebrow text-xs" style={{ color: "#bbb" }}>Cancel</button>
        <span className="font-eyebrow text-xs">{title}</span>
        <button onClick={() => setAutoOn((v) => !v)} className="font-eyebrow text-xs px-3 py-1.5 rounded-full" style={{ border: "1px solid #444", color: autoOn ? "#c9a227" : "#bbb" }}>
          Auto {autoOn ? "on" : "off"}
        </button>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        {/* Framing guide */}
        {ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              style={{
                width: "78%",
                aspectRatio: "1 / 1",
                border: `3px solid ${holdPct > 0 ? "#c9a227" : "rgba(255,255,255,0.7)"}`,
                borderRadius: guide === "circle" ? "50%" : "18px",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                transition: "border-color 0.15s",
              }}
            />
            {autoOn && holdPct > 0 && (
              <div className="absolute bottom-24 font-eyebrow text-xs px-3 py-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: "#c9a227" }}>
                Hold steady… {holdPct}%
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
            <p className="text-sm" style={{ color: "#f0a89f" }}>{error}</p>
          </div>
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="font-eyebrow text-xs" style={{ color: "#888" }}>Starting camera…</p>
          </div>
        )}
      </div>

      {/* Shutter */}
      <div className="flex items-center justify-center py-8" style={{ background: "#000" }}>
        <button
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          className="rounded-full disabled:opacity-40"
          style={{ width: 74, height: 74, background: "#fff", border: "5px solid #c9a227" }}
        />
      </div>
      <p className="text-center pb-6 font-eyebrow text-[10px]" style={{ background: "#000", color: "#666" }}>
        {autoOn ? "Fill the frame with the record and hold steady — it snaps on its own, or tap the shutter." : "Line it up and tap the shutter."}
      </p>
    </div>
  );
}

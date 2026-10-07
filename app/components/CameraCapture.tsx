"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Props = {
  title: string;               // e.g. "Front cover" or "Disc — Side A"
  guide?: "circle" | "square" | "band"; // framing guide shape; "band" is a wide strip for the runout etching
  subject?: "cover" | "disc" | "deadwax"; // tunes auto-snap: covers are lenient, discs need to fill the frame,
                                          // deadwax = the label filling the circle, so the etched ring around it is in shot
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
  autoSnap?: boolean;          // attempt auto-capture when a subject is detected
  hint?: string;               // replaces the default footer instruction
  confirm?: boolean;           // show the shot full-screen with Use / Retake before handing it back
                               // (defaults on for deadwax, where a blurry shot wastes a whole re-appraisal)
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

export function CameraCapture({ title, guide = "square", subject = "cover", onCapture, onCancel, autoSnap = true, hint, confirm }: Props) {
  const needConfirm = confirm ?? subject === "deadwax";
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
  const peakSharpRef = useRef(0); // deadwax: running peak of sharpness, decays slowly
  const startedAtRef = useRef(0);  // when the stream became ready; auto-snap waits for AF to settle
  const [preview, setPreview] = useState<string | null>(null); // confirm step
  const [attempt, setAttempt] = useState(0); // bumping this restarts the camera for a retake

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
    // Etched characters are tiny; keep more pixels so the model can read them.
    const jpeg = canvasToJpeg(canvas, subject === "deadwax" ? 2048 : 1600, subject === "deadwax" ? 0.9 : 0.85);
    stop();
    if (needConfirm) setPreview(jpeg);
    else onCapture(jpeg);
  }, [onCapture, stop, subject, needConfirm]);

  const retake = () => {
    setPreview(null);
    capturedRef.current = false;
    stableFramesRef.current = 0;
    lastMetricRef.current = null;
    peakSharpRef.current = 0;
    setHoldPct(0);
    setReady(false);
    setAttempt((a) => a + 1);
  };

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
        startedAtRef.current = performance.now();
        setReady(true);
      } catch (e) {
        setError("Couldn't access the camera. Check camera permission for this site in your browser settings, then reload.");
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [stop, subject, attempt]);

  // Auto-snap loop: sample the center region; when it's bright, detailed, and
  // stable for a few frames, capture. This is a heuristic, not true object
  // detection — the manual shutter is always available.
  useEffect(() => {
    if (!ready || !autoOn) { setHoldPct(0); stableFramesRef.current = 0; return; }
    let raf = 0;
    const NEEDED = subject === "cover" ? 16 : subject === "deadwax" ? 36 : 30; // covers ~0.6s, deadwax ~1.2s, discs ~1.1s
    const WARMUP_MS = subject === "deadwax" ? 1200 : 0; // let close-range autofocus settle before counting

    const tick = () => {
      const video = videoRef.current;
      if (!video || capturedRef.current) return;
      if (!analyzeCanvas.current) analyzeCanvas.current = document.createElement("canvas");
      const c = analyzeCanvas.current;

      if (subject === "deadwax") {
        // Label-in-the-circle detector. The user frames the LABEL (printed,
        // high contrast, easy to lock onto); the etched runout ring lands in
        // the shot on its own. We want: the circle full of printed detail,
        // the frame lit but not blown out, held still after autofocus settles.
        if (performance.now() - startedAtRef.current < WARMUP_MS) { raf = requestAnimationFrame(tick); return; }
        const S = 64;
        c.width = S; c.height = S;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        const side = Math.min(video.videoWidth, video.videoHeight) * 0.78;
        const sx = (video.videoWidth - side) / 2;
        const sy = (video.videoHeight - side) / 2;
        ctx.drawImage(video, sx, sy, side, side, 0, 0, S, S);
        const { data } = ctx.getImageData(0, 0, S, S);
        let lum = 0, edge = 0, prev = 0, n = 0;
        const mid = S / 2, r = S * 0.46;
        for (let y = 0; y < S; y++) {
          for (let x = 0; x < S; x++) {
            const i = (y * S + x) * 4;
            const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const d = Math.abs(l - prev); prev = l;
            if (Math.hypot(x - mid, y - mid) < r) { lum += l; edge += d; n++; }
          }
        }
        lum /= Math.max(1, n);
        edge /= Math.max(1, n);
        const detailed = edge > 2.5;                 // a printed label, not bare vinyl or a blur
        const litEnough = lum > 35 && lum < 225;
        const metric = lum + edge * 6;
        const stable = lastMetricRef.current != null && Math.abs(metric - lastMetricRef.current) < 3;
        lastMetricRef.current = metric;
        if (detailed && litEnough && stable) stableFramesRef.current += 1;
        else stableFramesRef.current = Math.max(0, stableFramesRef.current - 4);
        setHoldPct(Math.min(100, Math.round((stableFramesRef.current / NEEDED) * 100)));
        if (stableFramesRef.current >= NEEDED) { capture(); return; }
        raf = requestAnimationFrame(tick);
        return;
      }

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

  if (preview) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col wd-safe-top wd-safe-bottom-pad" style={{ background: "#000" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ color: "#fff" }}>
          <button onClick={() => { setPreview(null); onCancel(); }} className="font-eyebrow text-xs" style={{ color: "#bbb" }}>Cancel</button>
          <span className="font-eyebrow text-xs">Can you read it?</span>
          <span className="font-eyebrow text-xs" style={{ color: "#444" }}>&nbsp;</span>
        </div>
        <div className="relative flex-1 overflow-auto flex items-center justify-center" style={{ WebkitOverflowScrolling: "touch" }}>
          {/* Shown large so the etching is judged at roughly the size the model will see it. Pinch/scroll to inspect. */}
          <img src={preview} alt="Your shot" className="w-full h-auto" />
        </div>
        <p className="text-center px-6 pt-4 text-xs leading-relaxed" style={{ background: "#000", color: "#bbb" }}>
          Look at the smooth ring just outside the label. If you can make out letters and numbers there (pinch to zoom), so can we. If it's soft or washed out by glare, retake it.
        </p>
        <div className="flex gap-3 px-5 py-6" style={{ background: "#000" }}>
          <button onClick={retake} className="flex-1 py-4 rounded-2xl font-eyebrow text-sm" style={{ color: "#ddd", border: "1px solid #444" }}>
            Retake
          </button>
          <button onClick={() => { const p = preview; setPreview(null); onCapture(p); }} className="flex-1 py-4 rounded-2xl font-eyebrow text-sm" style={{ background: "#c9a227", color: "#0d0d0d" }}>
            Use this photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col wd-safe-top wd-safe-bottom-pad" style={{ background: "#000" }}>
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
                width: guide === "band" ? "86%" : "78%",
                aspectRatio: guide === "band" ? "3 / 1" : "1 / 1",
                border: `3px solid ${holdPct > 0 ? "#c9a227" : "rgba(255,255,255,0.7)"}`,
                borderRadius: guide === "circle" ? "50%" : guide === "band" ? "14px" : "18px",
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
        {hint
          ? hint
          : subject === "deadwax"
          ? (autoOn ? "Same as the disc photo, just closer: fit the label inside the circle and hold still. The etched numbers around the label come along for free." : "Fit the label inside the circle and tap the shutter. The etched numbers around the label come along for free.")
          : autoOn ? "Fill the frame with the record and hold steady — it snaps on its own, or tap the shutter." : "Line it up and tap the shutter."}
      </p>
    </div>
  );
}

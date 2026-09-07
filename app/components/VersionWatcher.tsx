"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Update notifier.
 *
 * Records the deployment version this tab loaded with, then polls /api/version
 * in the background. When a newer version is live, it shows a small banner
 * inviting the user to update now (a full reload onto the fresh build). As a
 * fallback, once an update is pending, the next in-app navigation also does a
 * hard load — so people who ignore the banner still land on the new build.
 */
export function VersionWatcher() {
  const loadedVersion = useRef<string | null>(null);
  const updateReady = useRef(false);
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = await res.json();
        if (cancelled || !version) return;

        if (loadedVersion.current === null) {
          loadedVersion.current = version; // first read = the version this tab is running
        } else if (version !== loadedVersion.current) {
          updateReady.current = true;
          setShowBanner(true);
        }
      } catch {
        /* offline or transient — ignore, try again next tick */
      }
    };

    // Fallback: once an update is ready, intercept in-app navigations to hard-load.
    const onClick = (e: MouseEvent) => {
      if (!updateReady.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || a.target === "_blank") return;
      e.preventDefault();
      window.location.assign(href);
    };

    check();
    const interval = setInterval(check, 60_000); // check every minute
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("click", onClick, true);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const update = () => window.location.reload();

  if (!showBanner || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-full shadow-lg"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        background: "var(--wd-surface, #1a1a1a)",
        border: "1px solid var(--wd-gold, #c9a227)",
        maxWidth: "calc(100vw - 24px)",
      }}
    >
      <span className="text-sm" style={{ color: "var(--wd-text, #fff)" }}>
        A new version is available.
      </span>
      <button
        onClick={update}
        className="font-eyebrow text-xs px-4 py-1.5 rounded-full whitespace-nowrap"
        style={{ background: "var(--wd-gold, #c9a227)", color: "#0d0d0d" }}
      >
        Update now
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-lg leading-none px-1"
        style={{ color: "var(--wd-text-faint, #888)" }}
      >
        ×
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

// Nudges users onto the latest deploy so nobody keeps operating on a stale
// bundle after we ship changes (the class of bug that made a "closed" decision
// keep reappearing for a user running yesterday's code).
//
// How it detects a new version: the production build references a
// content-hashed entry chunk in index.html (/assets/index-<hash>.js). We record
// the hash this session booted with, then periodically re-fetch index.html
// (bypassing cache) and compare. A different hash means a newer deploy is live.
//
// In dev there is no hashed entry chunk (Vite serves /src/main.tsx), so the
// boot hash comes back null and the checker quietly does nothing.

const POLL_MS = 60_000;
const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

function extractEntryHash(text: string): string | null {
  const m = text.match(ENTRY_RE);
  return m ? m[0] : null;
}

export default function UpdateNudge() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const bootHashRef = useRef<string | null>(null);

  useEffect(() => {
    // What entry chunk did this session load with?
    const bootSrc = Array.from(document.querySelectorAll("script"))
      .map((s) => (s as HTMLScriptElement).src)
      .find((src) => ENTRY_RE.test(src));
    bootHashRef.current = bootSrc ? extractEntryHash(bootSrc) : null;

    // No hashed entry (dev, or couldn't determine) → nothing to compare against.
    if (!bootHashRef.current) return;

    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/index.html?_=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const latest = extractEntryHash(await res.text());
        if (!cancelled && latest && latest !== bootHashRef.current) {
          setUpdateAvailable(true);
        }
      } catch {
        /* offline / transient — try again on the next tick */
      }
    };

    const interval = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    check(); // check once on mount too

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 20,
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 14,
        maxWidth: "calc(100vw - 32px)",
        padding: "12px 14px 12px 18px",
        borderRadius: 100,
        background: "#1C1712",
        color: "#FDFAF6",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.28)",
        fontSize: 15,
      }}
    >
      <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>New version available</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          flexShrink: 0,
          padding: "7px 16px",
          borderRadius: 100,
          background: "#FDFAF6",
          color: "#1C1712",
          border: "none",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.02em",
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}

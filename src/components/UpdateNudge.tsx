import { useEffect, useRef, useState } from "react";
import { C, RADIUS, SANS, body, meta } from "@/lib/design";

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

  // Set like the push nudge: white, a hairline border, square edges. It floats
  // over the feed, so it keeps the one soft shadow that lifts it off the paper.
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
        gap: 16,
        maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
        padding: "12px 12px 12px 18px",
        borderRadius: RADIUS,
        background: "#FFFFFF",
        border: `1px solid ${C.ruleStrong}`,
        boxShadow: "0 6px 18px rgba(20,18,16,0.10)",
        fontFamily: SANS,
      }}
    >
      <span style={{ ...body(14.5, C.ink), fontWeight: 700, whiteSpace: "nowrap" }}>
        New version available
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          ...meta(11, "#FFFFFF"),
          fontWeight: 700,
          letterSpacing: "0.16em",
          flexShrink: 0,
          padding: "11px 16px",
          borderRadius: RADIUS,
          background: C.burgundy,
          border: `1px solid ${C.burgundy}`,
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}

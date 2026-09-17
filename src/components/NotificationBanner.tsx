// ── NotificationBanner ────────────────────────────────────────────────────────
// A one-time, dismissible nudge at the top of the feed to turn on push alerts.
// Shows only when push is available but not yet enabled. On iPhones still in
// Safari (not installed), it guides the user to add to Home Screen instead.
//
// Set like a notification: icon, one bold line, one line under it. The whole
// card is the tap target, because iPhone can't be sent to the Home Screen by
// script and the steps are the only thing to give.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";
import { pushState, enablePush, canInstall, promptInstall, isStandalone } from "@/lib/push";
import { C, RADIUS, SANS, body, meta } from "@/lib/design";

// A dismissal quiets the nudge for three weeks rather than killing it forever.
const RESHOW_DAYS = 21;

const HIGHLIGHT = "#F4E06B";

/** The three dots that open Safari's menu, drawn rather than described. */
function DotsGlyph({ size = 17 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size + 11, height: size + 11, flexShrink: 0, margin: "0 3px",
      border: `1px solid ${C.ruleStrong}`, borderRadius: RADIUS, background: "#FFFFFF",
      verticalAlign: "middle",
    }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={C.ink} aria-hidden>
        <circle cx="5" cy="12" r="1.9" />
        <circle cx="12" cy="12" r="1.9" />
        <circle cx="19" cy="12" r="1.9" />
      </svg>
    </span>
  );
}

/** The iOS Share glyph, drawn rather than described. */
function ShareGlyph({ size = 17 }: { size?: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size + 11, height: size + 11, flexShrink: 0, margin: "0 3px",
      border: `1px solid ${C.ruleStrong}`, borderRadius: RADIUS, background: "#FFFFFF",
      verticalAlign: "middle",
    }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 15V3" />
        <path d="M8 7l4-4 4 4" />
        <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </svg>
    </span>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return <mark style={{ background: HIGHLIGHT, color: C.ink, padding: "1px 5px" }}>{children}</mark>;
}

type Step = { label: string; title: React.ReactNode; note?: string; items: React.ReactNode[] };

/**
 * Every browser on iPhone is WebKit underneath and says "iPhone" in its user
 * agent, so the install path has to be read off the browser itself. Safari and
 * Chrome both can do it, by different routes; Firefox and Edge cannot at all.
 */
type IosBrowser = "safari" | "chrome" | "other";

function iosBrowser(): IosBrowser {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/CriOS/i.test(ua)) return "chrome";
  if (/FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(ua)) return "other";
  return "safari";
}

function stepOne(browser: IosBrowser): Step {
  if (browser === "chrome") {
    return {
      label: "Step one",
      title: <>Add <Mark>ElevenEleven</Mark> to your home screen</>,
      note: "These are the Chrome steps. Safari keeps Share at the bottom of the screen instead.",
      items: [
        <>Tap <ShareGlyph /> <b>Share</b>, to the <b>right of the address bar</b>.</>,
        <>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
        <>Not there? Update Chrome. This needs iOS 16.4 or later.</>,
      ],
    };
  }
  if (browser === "other") {
    return {
      label: "Step one",
      title: <>Open this page in <Mark>Safari</Mark></>,
      note: "Firefox and Edge on iPhone cannot add a site to your home screen. Safari and Chrome can.",
      items: [
        <>Copy the link, then open it in <b>Safari</b>.</>,
        <>Tap <ShareGlyph /> <b>Share</b> at the bottom, then <b>Add to Home Screen</b>.</>,
        <>Tap <b>Add</b>.</>,
      ],
    };
  }
  return {
    label: "Step one",
    title: <>Add <Mark>ElevenEleven</Mark> to your home screen</>,
    note: "These are the Safari steps. In Chrome, Share sits to the right of the address bar.",
    items: [
      <>
        Tap <ShareGlyph /> <b>Share</b> in the bar at the <b>bottom</b> of Safari. On newer
        iPhones it lives in the <DotsGlyph /> menu beside the address bar.
      </>,
      <>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
      <>
        Don't see it? At the bottom of that list tap <b>Edit Actions</b>, then switch on
        <b> Add to Home Screen</b>.
      </>,
    ],
  };
}

const STEP_TWO: Step = {
  label: "Step two",
  title: <>Turn notifications on</>,
  note: "Do this from the icon you just added, not from your browser.",
  items: [
    <>Open <Mark>ElevenEleven</Mark> from your <b>home screen</b>.</>,
    <>Tap the <b>bell</b> in the top right.</>,
    <>Tap <b>Turn on push notifications</b>.</>,
    <>Tap <b>Allow</b> when your phone asks.</>,
  ],
};

export function HowTo({ isMobile, onClose }: { isMobile: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps = [stepOne(iosBrowser()), STEP_TWO];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add ElevenEleven to your home screen"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 330, background: C.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? 0 : 24, boxSizing: "border-box" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="no-scrollbar"
        style={{
          position: "relative", width: isMobile ? "100%" : "min(520px, 100%)", height: isMobile ? "100%" : "auto",
          maxHeight: isMobile ? "100%" : "90vh", overflowY: "auto", boxSizing: "border-box", borderRadius: isMobile ? 0 : RADIUS,
          // The photograph stays legible, the way the emails set it: a light veil
          // rather than a wash that hides it.
          background: "linear-gradient(rgba(252,251,249,0.30), rgba(252,251,249,0.62)), #EDECEA url(/email/legs-faded.jpg) center 28% / cover no-repeat",
          fontFamily: SANS, padding: isMobile ? "26px 22px 40px" : "32px 38px 38px",
          boxShadow: isMobile ? "none" : "0 30px 70px rgba(20,18,16,0.35)",
        }}
      >
        <button onClick={onClose} aria-label="Close" className="e11-close"
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", padding: 6, cursor: "pointer", color: C.ink, lineHeight: 0 }}>
          <X style={{ width: 22, height: 22 }} strokeWidth={1.5} />
        </button>

        <p style={{ textAlign: "center", marginTop: 6 }}>
          <span style={{ fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.3em", fontSize: 11.5, color: C.ink, background: HIGHLIGHT, padding: "3px 8px" }}>
            <b style={{ fontWeight: 700 }}>ELEVEN</b><span style={{ fontWeight: 300 }}>ELEVEN</span>
          </span>
        </p>
        <h2 style={{ ...body(isMobile ? 26 : 30, C.ink), fontWeight: 700, lineHeight: 1.16, letterSpacing: "-0.01em", textAlign: "center", margin: "22px auto 0", maxWidth: "26ch" }}>
          Never miss a weigh-in.
        </h2>
        <p style={{ ...body(14.5, C.inkSoft), textAlign: "center", marginTop: 10 }}>
          Two minutes, and we can reach you.
        </p>

        {steps.map((s) => (
          <section key={s.label} style={{ marginTop: 30 }}>
            <p style={{ ...meta(11, C.muted), fontWeight: 700 }}>{s.label}</p>
            <p style={{ ...body(isMobile ? 16 : 17, C.ink), fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.01em", marginTop: 8 }}>{s.title}</p>
            {s.note && <p style={{ ...body(14, C.inkSoft), marginTop: 12 }}>{s.note}</p>}
            <ol style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
              {s.items.map((item, i) => (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 8, padding: "8px 0" }}>
                  <span style={{ ...body(14, C.muted), fontWeight: 700 }}>{i + 1}</span>
                  <span style={body(14.5, C.ink)}>{item}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <button onClick={onClose} style={{
          ...meta(12, "#FFFFFF"), fontWeight: 700, letterSpacing: "0.16em",
          width: "100%", background: C.burgundy, border: "none", borderRadius: RADIUS,
          padding: "16px 0", marginTop: 30, cursor: "pointer",
        }}>
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function NotificationBanner({ userId, isMobile }: { userId: string; isMobile: boolean }) {
  const dismissKey = `ee_push_prompt_dismissed_${userId}`;
  const [state, setState] = useState(() => pushState());
  const [installable, setInstallable] = useState(() => canInstall());
  const [busy, setBusy] = useState(false);
  const [howTo, setHowTo] = useState(false);

  const [dismissed, setDismissed] = useState(() => {
    try {
      const raw = localStorage.getItem(dismissKey);
      if (!raw) return false;
      // "1" is the old forever-dismissal. Convert it to a timestamped one so the
      // nudge comes back, without resurfacing it the same day for everyone.
      if (raw === "1") {
        localStorage.setItem(dismissKey, String(Date.now()));
        return true;
      }
      const at = Number(raw);
      if (!Number.isFinite(at)) return false;
      return Date.now() - at < RESHOW_DAYS * 86400000;
    } catch {
      return false;
    }
  });

  // Chrome may fire beforeinstallprompt after this mounts.
  useEffect(() => {
    const onInstallable = () => setInstallable(canInstall());
    window.addEventListener("ee-installable", onInstallable);
    window.addEventListener("appinstalled", onInstallable);
    return () => {
      window.removeEventListener("ee-installable", onInstallable);
      window.removeEventListener("appinstalled", onInstallable);
    };
  }, []);

  if (dismissed) return null;

  // iPhone needs the manual share sheet. Android gets a real one-tap install.
  const iosInstall = state === "needs-install";
  const androidInstall = !iosInstall && installable;
  const install = iosInstall || androidInstall;

  // Push nudges are only for the installed app, where push actually lands. In a
  // browser, desktop included, email is the channel and this has nothing to
  // offer, so it was just taking up space at the top of the feed.
  if (!install && !isStandalone()) return null;
  if (!install && state !== "default") return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey, String(Date.now())); } catch { /* private mode */ }
    setDismissed(true);
  };
  const turnOn = async () => {
    setBusy(true);
    await enablePush(userId);
    setState(pushState());
    setBusy(false);
  };
  const addToHome = async () => {
    setBusy(true);
    await promptInstall();
    setInstallable(canInstall());
    setBusy(false);
  };

  const title = install ? "Add us to your home screen" : "Turn on notifications";
  const open = androidInstall ? addToHome : iosInstall ? () => setHowTo(true) : turnOn;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && open()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!busy) open(); } }}
        style={{
          display: "flex", alignItems: "center", gap: isMobile ? 13 : 16, cursor: "pointer",
          background: "#FFFFFF", border: `1px solid ${C.ruleStrong}`, borderRadius: RADIUS,
          padding: isMobile ? "13px 14px" : "15px 18px", marginTop: isMobile ? 14 : 30,
          boxShadow: "0 6px 18px rgba(20,18,16,0.06)", opacity: busy ? 0.6 : 1,
        }}
      >
        <span style={{ width: 40, height: 40, flexShrink: 0, background: C.ink, borderRadius: RADIUS, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bell style={{ width: 19, height: 19, color: C.paper }} strokeWidth={1.8} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", ...body(isMobile ? 14.5 : 15.5, C.ink), fontWeight: 700, lineHeight: 1.25 }}>{title}</span>
          <span style={{ display: "block", ...body(isMobile ? 13.5 : 14, C.inkSoft), marginTop: 2 }}>
            {busy ? "One moment..." : "Never miss a weigh-in."}
          </span>
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); dismiss(); }}
          aria-label="Dismiss"
          style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: C.muted, lineHeight: 0, flexShrink: 0 }}
        >
          <X style={{ width: 16, height: 16 }} strokeWidth={1.6} />
        </button>
      </div>
      {howTo && <HowTo isMobile={isMobile} onClose={() => setHowTo(false)} />}
    </>
  );
}
